import { randomUUID } from 'node:crypto';

import type { ClientSession, Connection } from 'mongoose';

import { AuthorizationScope } from '../../../../../domain/authorization/built-in-roles.js';
import type { ObjectScope } from '../../../../../domain/authorization/content-access.js';
import type { ISiteRole, ISiteRoleActor, SiteRoleChange } from '../../../../../domain/authorization/site-role.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';

type Database = NonNullable<Connection['db']>;

interface ICustomRoleRecord {
  readonly _id: string;
  readonly scope: AuthorizationScope.Site;
  readonly siteId: string;
  readonly roleId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

interface IAssignmentRecord {
  readonly _id: string;
  readonly scope: AuthorizationScope.Site;
  readonly siteId: string;
  readonly roleId: string;
  readonly actorId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

interface IRoleGrant {
  readonly roleId: string;
  readonly actionId: string;
  readonly objectScopes: readonly ObjectScope[];
}

export async function readCustomSiteRoles(db: Database, siteId: string, session: ClientSession,
  grants: readonly IRoleGrant[]): Promise<{ customRoles: ISiteRole[]; siteActors: ISiteRoleActor[] }> {
  const options = { session };
  const scope = { scope: AuthorizationScope.Site, siteId } as const;
  const roles = await db.collection<ICustomRoleRecord>('roles').find(scope, options).sort({ key: 1 }).toArray();
  const assignments = await db.collection<IAssignmentRecord>('role_assignments').find(scope, options).toArray();
  const accounts = await db.collection<{ _id: string; email: string }>('admin_users').find({
    _id: { $in: [...new Set(assignments.map(({ actorId }) => actorId))] },
    deletedAt: null,
  }, {
    session, projection: { _id: 1, email: 1 },
  }).sort({ email: 1 }).toArray();
  const siteActors = accounts.map(({ _id, email }) => ({ adminUserId: _id, email }));
  const accountsById = new Set(siteActors.map(({ adminUserId }) => adminUserId));
  const customRoles = roles.map(({ roleId, key, name, description }) => ({
    roleId,
    key,
    name,
    description,
    actionIds: grants.filter((grant) => grant.roleId === roleId).map(({ actionId }) => actionId),
    objectScopes: Object.fromEntries(grants.filter((grant) => grant.roleId === roleId)
      .map(({ actionId, objectScopes }) => [actionId, objectScopes])),
    actorIds: assignments.filter((assignment) => assignment.roleId === roleId && accountsById.has(assignment.actorId))
      .map(({ actorId }) => actorId),
  }));

  return { siteActors, customRoles };
}

export async function changeCustomSiteRole(db: Database, input: {
  readonly siteId: string;
  readonly actorId: string;
  readonly change: SiteRoleChange;
  readonly siteActors: readonly ISiteRoleActor[];
}, session: ClientSession): Promise<string> {
  const { siteId, actorId, change, siteActors } = input;
  const options = { session };
  const roleId = change.roleId ?? randomUUID();
  const site = { siteId, scope: AuthorizationScope.Site } as const;
  const selector = { ...site, roleId };
  const roles = db.collection<ICustomRoleRecord>('roles');
  const assignments = db.collection<IAssignmentRecord>('role_assignments');

  if (change.roleId !== null && !await roles.findOne(selector, options)) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Site role not found');
  }
  if ('remove' in change) {
    await roles.deleteOne(selector, options);
    await assignments.deleteMany(selector, options);

    return roleId;
  }
  if (change.actorIds.some((id) => !siteActors.some((account) => account.adminUserId === id))) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Role assignment requires an account on this site');
  }
  if (await roles.findOne({ ...site, key: change.key, roleId: { $ne: roleId } }, options)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Role key is already used on this site');
  }

  const { key, name, description } = change;
  const at = new Date();

  await roles.updateOne(selector, {
    $setOnInsert: { _id: roleId, createdAt: at, createdBy: actorId },
    $set: { key, name, description, version: randomUUID(), updatedAt: at, updatedBy: actorId },
  }, { ...options, upsert: true });
  await assignments.deleteMany({ ...selector, actorId: { $nin: [...change.actorIds] } }, options);

  if (change.actorIds.length) {
    await assignments.bulkWrite(change.actorIds.map((assignee) => ({
      updateOne: {
        filter: { ...selector, actorId: assignee },
        update: { $setOnInsert: { _id: randomUUID(), createdAt: at, createdBy: actorId } },
        upsert: true,
      },
    })), options);
  }

  return roleId;
}
