import { randomUUID } from 'node:crypto';

import type { Connection } from 'mongoose';

import { actionRouteKey } from '../../../../../domain/authorization/action-catalog.js';
import { BuiltInRoleId } from '../../../../../domain/authorization/built-in-roles.js';
import { coreActions } from '../../../../../domain/authorization/core-actions.js';

export async function migrateDumpAccess(connection: Connection): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not open');
  }

  const at = new Date();
  const ids = ['cms.dumps.list', 'cms.dumps.create', 'cms.dumps.import', 'cms.dumps.restore',
    'cms.installation-dumps.create', 'cms.installation-dumps.restore', 'cms.installation-dumps.download'];

  for (const actionId of ids) {
    const action = coreActions.find((item) => item.actionId === actionId);

    if (!action) {
      throw new Error('Missing archive action: ' + actionId);
    }

    await db.collection<{ _id: string }>('actions').updateOne({ _id: actionId }, {
      $set: { ...action, routeKey: actionRouteKey(action.route), allowedObjectScopes: [] },
      $setOnInsert: { status: 'active' },
    }, { upsert: true });

    const roleIds = action.scope === 'site'
      ? [BuiltInRoleId.SystemAdmin, BuiltInRoleId.SiteAdmin] : [BuiltInRoleId.SystemAdmin];

    for (const roleId of roleIds) {
      await db.collection<{ _id: string }>('role_permissions').updateOne({ siteId: null, roleId, actionId }, {
        $setOnInsert: {
          _id: randomUUID(),
          objectScopes: ['all'],
          createdAt: at,
          updatedAt: at,
          createdBy: null,
          updatedBy: null,
        },
      }, { upsert: true });
    }
  }
}
