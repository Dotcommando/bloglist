import type { Connection } from 'mongoose';

import { actionRouteKey } from '../../../../../domain/authorization/action-catalog.js';
import { coreActions } from '../../../../../domain/authorization/core-actions.js';

export async function migrateAddonWorkspaceActions(connection: Connection): Promise<void> {
  const collection = connection.db!.collection<{ _id: string }>('actions');

  for (const action of coreActions.filter((entry) => entry.route.includes('/addon-workspaces'))) {
    await collection.updateOne({ _id: action.actionId }, {
      $setOnInsert: { ...action, status: 'active', routeKey: actionRouteKey(action.route), allowedObjectScopes: [] },
    }, { upsert: true });
  }
}
