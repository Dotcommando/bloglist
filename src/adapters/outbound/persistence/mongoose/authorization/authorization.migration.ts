import { randomUUID } from 'node:crypto';

import type { Connection } from 'mongoose';

import { actionRouteKey, isDelegableSiteAction } from '../../../../../domain/authorization/action-catalog.js';
import {
  AuthorizationScope, builtInAdminGroups, BuiltInRoleId, legacyAddonAdminActionId,
} from '../../../../../domain/authorization/built-in-roles.js';
import { supportsContentScope } from '../../../../../domain/authorization/content-access.js';
import { coreActions } from '../../../../../domain/authorization/core-actions.js';

const builtInRoles = [
  {
    roleId: BuiltInRoleId.SystemAdmin,
    key: 'system-admin',
    name: 'SystemAdmin',
    scope: AuthorizationScope.Installation,
    description: 'Administers the installation and all its sites.',
  },
  {
    roleId: BuiltInRoleId.SiteAdmin,
    key: 'site-admin',
    name: 'SiteAdmin',
    scope: AuthorizationScope.Site,
    description: 'Administers the site named by the role assignment.',
  },
  {
    roleId: BuiltInRoleId.Manager,
    key: 'manager',
    name: 'Manager',
    scope: AuthorizationScope.Site,
    description: 'Uses actions explicitly granted on the assigned site.',
  },
] as const;

export async function migrateAuthorization(connection: Connection): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not open');
  }

  const at = new Date();
  const roles = db.collection<{ _id: string }>('roles');

  for (const role of builtInRoles) {
    await roles.updateOne({ _id: role.roleId }, {
      $setOnInsert: {
        ...role,
        siteId: null,
        version: randomUUID(),
        createdAt: at,
        updatedAt: at,
        createdBy: null,
        updatedBy: null,
      },
    }, { upsert: true });
  }

  const domains = new Set(coreActions.flatMap((action) => action.domains));

  for (const domainId of domains) {
    const name = domainId.slice('cms.'.length).split('-')
      .map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');

    await db.collection<{ _id: string }>('action_domains').updateOne({ _id: domainId }, {
      $setOnInsert: { domainId, ownerKey: 'cms', name, description: `${name} operations in CMS Zarya.`, status: 'active' },
    }, { upsert: true });
  }
  await db.collection<{ _id: string }>('actions').bulkWrite(coreActions.map((action) => ({
    updateOne: {
      filter: { _id: action.actionId },
      update: {
        $setOnInsert: {
          ...action,
          routeKey: actionRouteKey(action.route),
          status: 'active',
          allowedObjectScopes: supportsContentScope(action.actionId) ? ['all', 'own', 'groups']
            : isDelegableSiteAction(action) ? ['all'] : [],
        },
      },
      upsert: true,
    },
  })));

  await db.collection<{ _id: string }>('access_groups').bulkWrite(builtInAdminGroups.map((group) => ({
    updateOne: {
      filter: { _id: group.groupId },
      update: {
        $setOnInsert: {
          ...group,
          siteId: null,
          status: 'active',
          version: randomUUID(),
          createdAt: at,
          updatedAt: at,
          createdBy: null,
          updatedBy: null,
        },
      },
      upsert: true,
    },
  })));
  const adminActions = coreActions.filter((action) => action.admission === 'admin'
    || action.admission === 'installationAdmin' || action.actionId === legacyAddonAdminActionId);
  const grants = adminActions.flatMap(({ actionId, scope, admission }) => {
    const appliesToSiteAdmin = scope === AuthorizationScope.Site && admission === 'admin'
      || actionId === 'cms.sites.list';
    const roleIds = appliesToSiteAdmin
      ? [BuiltInRoleId.SystemAdmin, BuiltInRoleId.SiteAdmin] : [BuiltInRoleId.SystemAdmin];

    return roleIds.map((roleId) => ({
      updateOne: {
        filter: { siteId: null, roleId, actionId },
        update: {
          $setOnInsert: {
            _id: randomUUID(), objectScopes: ['all'], createdAt: at, updatedAt: at, createdBy: null, updatedBy: null,
          },
        },
        upsert: true,
      },
    }));
  });

  await db.collection<{ _id: string }>('role_permissions').bulkWrite(grants);
  await db.collection('admin_users').aggregate([
    { $match: { deletedAt: null } },
    {
      $project: {
        _id: { $concat: ['system-admin:', '$_id'] },
        actorId: '$_id',
        roleId: { $literal: BuiltInRoleId.SystemAdmin },
        scope: { $literal: AuthorizationScope.Installation },
        siteId: { $literal: null },
        createdAt: { $literal: at },
        createdBy: { $literal: null },
      },
    },
    { $merge: { into: 'role_assignments', whenMatched: 'keepExisting', whenNotMatched: 'insert' } },
  ]).toArray();
}
