import { randomUUID } from 'node:crypto';

import type { ClientSession, Connection } from 'mongoose';

import {
  AuthorizationScope, BuiltInAdminGroupId, BuiltInRoleId,
} from '../../../../../domain/authorization/built-in-roles.js';
import type { ISiteGroup, ISiteRoleActor, SiteGroupChange } from '../../../../../domain/authorization/site-role.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';

type Database = NonNullable<Connection['db']>;

interface IGroupRecord {
  readonly _id: string;
  readonly siteId: string | null;
  readonly groupId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly status: 'active' | 'archived';
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

interface IMembershipRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly groupId: string;
  readonly actorId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export async function readSiteGroups(db: Database, siteId: string, siteActors: readonly ISiteRoleActor[],
  session: ClientSession, installation: boolean): Promise<ISiteGroup[]> {
  const options = { session };
  const definitions = await db.collection<IGroupRecord & { roleId: BuiltInRoleId }>('access_groups')
    .find({
      siteId: null,
      status: 'active',
      groupId: { $in: installation ? Object.values(BuiltInAdminGroupId) : [BuiltInAdminGroupId.Site] },
    }, options).sort({ key: 1 }).toArray();
  const builtIn: ISiteGroup[] = [];

  for (const { groupId, key, name, description, roleId } of definitions) {
    const global = groupId === BuiltInAdminGroupId.Global;
    const scope = global ? AuthorizationScope.Installation : AuthorizationScope.Site;
    const expectedRoleId = global ? BuiltInRoleId.SystemAdmin : BuiltInRoleId.SiteAdmin;

    if (roleId !== expectedRoleId) {
      continue;
    }

    const assigned = await db.collection<{ actorId: string }>('role_assignments')
      .distinct('actorId', { siteId: global ? null : siteId, roleId, scope }, options);
    const members = global
      ? (await db.collection<{ _id: string; email: string }>('admin_users').find({
        _id: { $in: assigned }, deletedAt: null,
      }, { ...options, projection: { _id: 1, email: 1 } }).sort({ email: 1 }).toArray())
        .map(({ _id, email }) => ({ adminUserId: _id, email }))
      : siteActors.filter(({ adminUserId }) => assigned.includes(adminUserId));

    builtIn.push({
      groupId,
      key,
      name,
      description,
      builtIn: scope,
      members,
      actorIds: members.map(({ adminUserId }) => adminUserId),
    });
  }

  const groups = await db.collection<IGroupRecord>('access_groups').find({ siteId, status: 'active' }, options)
    .sort({ key: 1 }).toArray();
  const memberships = await db.collection<IMembershipRecord>('access_group_memberships').find({
    siteId, actorId: { $in: siteActors.map(({ adminUserId }) => adminUserId) },
  }, options).toArray();

  return [...builtIn, ...groups.map(({ groupId, key, name, description }) => ({
    groupId,
    key,
    name,
    description,
    actorIds: memberships.filter((membership) => membership.groupId === groupId).map(({ actorId }) => actorId),
  }))];
}

export async function changeSiteGroup(db: Database, input: {
  readonly siteId: string;
  readonly actorId: string;
  readonly change: SiteGroupChange;
  readonly siteActors: readonly ISiteRoleActor[];
}, session: ClientSession): Promise<void> {
  const { siteId, actorId, change, siteActors } = input;
  const options = { session };
  const groupId = change.groupId ?? randomUUID();

  if (Object.values<string>(BuiltInAdminGroupId).includes(groupId)) {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Built-in administrator groups are read-only');
  }

  const selector = { siteId, groupId };
  const groups = db.collection<IGroupRecord>('access_groups');
  const memberships = db.collection<IMembershipRecord>('access_group_memberships');
  const at = new Date();
  const updated = { version: randomUUID(), updatedAt: at, updatedBy: actorId };

  if (change.groupId !== null && !await groups.findOne({ ...selector, status: 'active' }, options)) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Active site group not found');
  }
  if ('remove' in change) {
    await groups.updateOne(selector, { $set: { ...updated, status: 'archived' } }, options);
    await memberships.deleteMany(selector, options);

    return;
  }
  if (change.actorIds.some((id) => !siteActors.some((account) => account.adminUserId === id))) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Group membership requires an account on this site');
  }
  if (await groups.findOne({ siteId, key: change.key, groupId: { $ne: groupId } }, options)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Group key is already used on this site');
  }

  const { key, name, description } = change;

  await groups.updateOne(selector, {
    $setOnInsert: { _id: groupId, createdAt: at, createdBy: actorId, status: 'active' },
    $set: { ...updated, key, name, description },
  }, { ...options, upsert: true });
  await memberships.deleteMany({ ...selector, actorId: { $nin: [...change.actorIds] } }, options);

  if (change.actorIds.length) {
    await memberships.bulkWrite(change.actorIds.map((member) => ({
      updateOne: {
        filter: { ...selector, actorId: member },
        update: { $setOnInsert: { _id: randomUUID(), createdAt: at, createdBy: actorId } },
        upsert: true,
      },
    })), options);
  }
}
