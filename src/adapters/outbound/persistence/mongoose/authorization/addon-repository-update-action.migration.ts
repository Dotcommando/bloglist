import { randomUUID } from 'node:crypto';

import type { Connection } from 'mongoose';

import { actionRouteKey } from '../../../../../domain/authorization/action-catalog.js';
import { BuiltInRoleId } from '../../../../../domain/authorization/built-in-roles.js';
import { coreActions } from '../../../../../domain/authorization/core-actions.js';

export async function migrateAddonRepositoryUpdateAction(connection: Connection): Promise<void> {
  const db = connection.db;
  const actionId = 'cms.addons.check-update';
  const action = coreActions.find(entry => entry.actionId === actionId);

  if (!db || !action) {
    throw new Error('Missing database or repository update Action');
  }

  await db.collection<{ _id: string }>('actions').updateOne({ _id: actionId }, {
    $setOnInsert: { ...action, status: 'active', routeKey: actionRouteKey(action.route), allowedObjectScopes: [] },
  }, { upsert: true });

  const at = new Date();

  await db.collection<{ _id: string }>('role_permissions').updateOne({
    siteId: null, roleId: BuiltInRoleId.SystemAdmin, actionId,
  }, {
    $setOnInsert: {
      _id: randomUUID(), objectScopes: ['all'], createdAt: at, updatedAt: at, createdBy: null, updatedBy: null,
    },
  }, { upsert: true });
}
