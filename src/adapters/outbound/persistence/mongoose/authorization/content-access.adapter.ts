import { randomUUID } from 'node:crypto';

import type { ClientSession, Connection } from 'mongoose';

import {
  authorizeContentCreation, type IContentAccess, type IContentCreationAccess, resolveContentAccess,
} from '../../../../../domain/authorization/content-access.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { readAdminAuthority } from './admin-authority.adapter.js';

type Database = NonNullable<Connection['db']>;

interface IGuardRecord {
  readonly _id: string;
  readonly revision: string;
  readonly writeGuard: string;
}

export function contentAccessMatch(access: IContentAccess | undefined): Record<string, unknown> {
  if (!access) {
    return {};
  }

  const { siteId } = access;

  if (access.scopes.includes('all')) {
    return { siteId };
  }

  const alternatives = [
    ...(access.scopes.includes('own') ? [{ createdBy: access.actorId }] : []),
    ...(access.scopes.includes('groups') && access.groupIds.length
      ? [{ accessGroupId: { $in: access.groupIds } }] : []),
  ];

  return alternatives.length ? { siteId, $or: alternatives } : { siteId, _id: { $exists: false } };
}

export async function writeAuthorizationGuard(db: Database, key: string, session: ClientSession,
  changePolicy = false): Promise<void> {
  const guard = randomUUID();

  await db.collection<IGuardRecord>('authorization_guards').updateOne({ _id: key }, {
    $set: { writeGuard: guard, ...(changePolicy ? { revision: guard } : {}) },
    ...(changePolicy ? {} : { $setOnInsert: { revision: guard } }),
  }, { session, upsert: true });
}

export async function lockContentWrite(db: Database, access: IContentAccess, session: ClientSession | undefined,
  changesGroup = false): Promise<IContentAccess> {
  if (!session) {
    throw new Error('Content authorization requires a transaction');
  }

  const { actorId, siteId, actionId } = access;
  const actor = await db.collection<{ _id: string }>('admin_users').findOne({
    _id: actorId, blocked: false, deletedAt: null,
  }, { session, projection: { _id: 1 } });
  const current = actor && resolveContentAccess(await readAdminAuthority(db, actorId, session), actorId, siteId,
    actionId);

  if (!current) {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Content permission was revoked');
  }
  await writeAuthorizationGuard(db, 'actor:' + actorId, session);

  if (!access.administrator || !current.administrator || changesGroup) {
    await writeAuthorizationGuard(db, 'site:' + siteId, session);
  }

  return current;
}

export async function createContentAttributes(db: Database, siteId: string, creation: IContentCreationAccess,
  session: ClientSession): Promise<{ createdBy?: string; accessGroupId?: string | null }> {
  authorizeContentCreation(siteId, creation);
  const { authority, accessGroupId = null } = creation;

  if (!authority) {
    return {};
  }

  const effective = await lockContentWrite(db, authority, session, accessGroupId !== null);

  authorizeContentCreation(siteId, { authority: effective, accessGroupId });
  await requireActiveContentGroup(db, siteId, accessGroupId, session);

  return { createdBy: authority.actorId, accessGroupId };
}

export async function requireActiveContentGroup(db: Database, siteId: string, groupId: string | null,
  session: ClientSession): Promise<void> {
  if (
    groupId !== null
    && !await db.collection<{ siteId: string; groupId: string }>('access_groups')
      .findOne({ siteId, groupId, status: 'active' }, { session })
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Active access group not found in this site');
  }
}
