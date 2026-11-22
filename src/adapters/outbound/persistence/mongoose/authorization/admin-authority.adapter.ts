import { randomUUID } from 'node:crypto';

import type { ClientSession, Connection } from 'mongoose';

import {
  hasAdministratorGrant, type IAdminAuthorization, type IInitialAdminRole,
} from '../../../../../domain/authorization/admin-authorization.js';
import {
  AuthorizationScope, BuiltInAdminGroupId, BuiltInRoleId, defaultManagerActionIds,
} from '../../../../../domain/authorization/built-in-roles.js';
import type { ObjectScope } from '../../../../../domain/authorization/content-access.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { writeAuthorizationGuard } from './content-access.adapter.js';

type Database = NonNullable<Connection['db']>;

interface IRoleAssignmentRecord {
  readonly _id: string;
  readonly roleId: string;
  readonly scope: AuthorizationScope;
  readonly siteId: string | null;
  readonly actorId: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

interface IRoleRecord {
  readonly roleId: string;
  readonly scope: AuthorizationScope;
  readonly siteId: string | null;
}

export async function readAdminAuthority(db: Database, actorId: string, session?: ClientSession):
Promise<IAdminAuthorization> {
  const options = session ? { session } : undefined;
  const assignments = await db.collection<IRoleAssignmentRecord>('role_assignments').find({ actorId }, options)
    .toArray();
  const roles = await db.collection<IRoleRecord>('roles').find({
    roleId: { $in: assignments.map((assignment) => assignment.roleId) },
  }, options).toArray();
  const byId = new Map(roles.map((role) => [role.roleId, role]));
  const groupsForAdmins = assignments.some(({ roleId }) =>
    roleId === BuiltInRoleId.SystemAdmin || roleId === BuiltInRoleId.SiteAdmin)
    ? await db.collection<{ groupId: string; roleId: string }>('access_groups')
      .find({ siteId: null, status: 'active', groupId: { $in: Object.values(BuiltInAdminGroupId) } }, options)
      .toArray()
    : [];
  const globalGroup = groupsForAdmins.some(({ groupId, roleId }) =>
    groupId === BuiltInAdminGroupId.Global && roleId === BuiltInRoleId.SystemAdmin);
  const siteGroup = groupsForAdmins.some(({ groupId, roleId }) =>
    groupId === BuiltInAdminGroupId.Site && roleId === BuiltInRoleId.SiteAdmin);
  let systemAdmin = false;
  const siteIds = new Set<string>();
  const siteAdminSiteIds = new Set<string>();
  const delegated = [];

  for (const assignment of assignments) {
    const role = byId.get(assignment.roleId);

    if (role?.scope !== assignment.scope) {
      continue;
    }
    if (role.scope === AuthorizationScope.Installation) {
      systemAdmin ||= globalGroup && role.roleId === BuiltInRoleId.SystemAdmin
        && assignment.siteId === null && role.siteId === null;
    } else if (
      assignment.siteId !== null
      && (
        role.siteId === assignment.siteId
      || role.siteId === null
      && (role.roleId === BuiltInRoleId.SiteAdmin
      || role.roleId === BuiltInRoleId.Manager)
      )
    ) {
      if (role.roleId === BuiltInRoleId.SiteAdmin) {
        if (siteGroup) {
          siteIds.add(assignment.siteId);
          siteAdminSiteIds.add(assignment.siteId);
        }
      } else {
        siteIds.add(assignment.siteId);
        delegated.push({ siteId: assignment.siteId, roleId: role.roleId });
      }
    }
  }

  interface Grant { siteId: string; roleId: string; actionId: string; objectScopes: ObjectScope[] }
  const administratorRoles = [
    ...(systemAdmin ? [BuiltInRoleId.SystemAdmin] : []),
    ...(siteAdminSiteIds.size ? [BuiltInRoleId.SiteAdmin] : []),
  ];
  const administratorGrants = administratorRoles.length
    ? await db.collection<Omit<Grant, 'siteId'> & { siteId: null }>('role_permissions').find({
      siteId: null, roleId: { $in: administratorRoles }, objectScopes: ['all'],
    }, options).toArray()
    : [];
  const activeActions = new Set(administratorGrants.length
    ? await db.collection<{ actionId: string }>('actions').distinct('actionId', {
      actionId: { $in: administratorGrants.map(({ actionId }) => actionId) }, status: 'active',
    }, options ?? {})
    : []);
  const administratorActionIds = (roleId: BuiltInRoleId): string[] => administratorGrants
    .filter((grant) => grant.roleId === roleId && activeActions.has(grant.actionId)).map((grant) => grant.actionId);
  const grants: Grant[] = delegated.length ? await db.collection<Grant>('role_permissions')
    .find({ $or: delegated }, options).toArray() : [];
  const explicitManagerSites = new Set(grants.filter(({ roleId }) => roleId === BuiltInRoleId.Manager)
    .map(({ siteId }) => siteId));
  const managerSites = delegated.filter(({ siteId, roleId }) =>
    roleId === BuiltInRoleId.Manager && !explicitManagerSites.has(siteId)).map(({ siteId }) => siteId);
  const overrides = managerSites.length ? await db.collection<{ _id: string }>('manager_permission_overrides')
    .distinct('_id', { _id: { $in: managerSites } }, options ?? {}) : [];

  for (const siteId of managerSites.filter((id) => !overrides.includes(id))) {
    grants.push(...defaultManagerActionIds.map((actionId) => ({
      siteId, roleId: BuiltInRoleId.Manager, actionId, objectScopes: ['all' as const],
    })));
  }
  const bySite = new Map<string, Map<string, Set<ObjectScope>>>();

  for (const grant of grants) {
    const actions = bySite.get(grant.siteId) ?? new Map<string, Set<ObjectScope>>();
    const scopes = actions.get(grant.actionId) ?? new Set<ObjectScope>();

    for (const scope of grant.objectScopes) {
      scopes.add(scope);
    }
    actions.set(grant.actionId, scopes);
    bySite.set(grant.siteId, actions);
  }

  const memberships = bySite.size ? await db.collection<{ siteId: string; groupId: string }>('access_group_memberships')
    .find({ actorId, siteId: { $in: [...bySite.keys()] } }, options).toArray() : [];
  const groups = memberships.length ? await db.collection<{ siteId: string; groupId: string }>('access_groups')
    .find({ status: 'active', $or: memberships.map(({ siteId, groupId }) => ({ siteId, groupId })) }, options)
    .toArray() : [];
  const siteGrants = [...bySite].map(([siteId, actions]) => ({
    siteId,
    actionIds: [...actions.keys()],
    objectScopes: Object.fromEntries([...actions].map(([actionId, scopes]) => [actionId, [...scopes]])),
    groupIds: groups.filter((group) => group.siteId === siteId).map(({ groupId }) => groupId),
  }));

  return {
    systemAdmin,
    siteIds: [...siteIds].sort(),
    siteAdminSiteIds: [...siteAdminSiteIds].sort(),
    ...(systemAdmin ? { systemActionIds: administratorActionIds(BuiltInRoleId.SystemAdmin) } : {}),
    ...(siteAdminSiteIds.size ? { siteAdminActionIds: administratorActionIds(BuiltInRoleId.SiteAdmin) } : {}),
    ...(siteGrants.length ? { siteGrants } : {}),
  };
}

export async function requireSiteAdministrator(db: Database, actorId: string, siteId: string,
  actionId: string, session: ClientSession): Promise<IAdminAuthorization> {
  const actor = await db.collection<{ _id: string }>('admin_users')
    .findOne({ _id: actorId, blocked: false, deletedAt: null }, { session, projection: { _id: 1 } });
  const authority = await readAdminAuthority(db, actorId, session);

  if (!actor || !hasAdministratorGrant(authority, actionId, siteId)) {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Site administrator required');
  }

  return authority;
}

export async function countActiveSystemAdministrators(db: Database, session: ClientSession): Promise<number> {
  const [result] = await db.collection<IRoleAssignmentRecord>('role_assignments').aggregate<{ count: number }>([
    { $match: { roleId: BuiltInRoleId.SystemAdmin, scope: AuthorizationScope.Installation, siteId: null } },
    { $lookup: { from: 'admin_users', localField: 'actorId', foreignField: '_id', as: 'account' } },
    { $match: { account: { $elemMatch: { blocked: false, deletedAt: null } } } },
    { $count: 'count' },
  ], { session }).toArray();

  return result?.count ?? 0;
}

export async function assignInitialAdminRole(db: Database, session: ClientSession,
  actorId: string, at: Date, initialRole?: IInitialAdminRole): Promise<void> {
  const roleId = initialRole?.roleId ?? BuiltInRoleId.SystemAdmin;
  const siteId = initialRole?.siteId ?? null;
  const scope = roleId === BuiltInRoleId.SystemAdmin ? AuthorizationScope.Installation : AuthorizationScope.Site;

  if ((scope === AuthorizationScope.Installation) !== (siteId === null)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid role assignment');
  }

  const builtIn = Object.values<string>(BuiltInRoleId).includes(roleId);

  if (siteId !== null) {
    if (!builtIn) {
      await writeAuthorizationGuard(db, 'site:' + siteId, session);
    }
    if (!await db.collection<{ _id: string }>('sites').findOne({ _id: siteId }, { session })) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }

  const role = await db.collection<IRoleRecord>('roles')
    .findOne({ roleId, scope, siteId: builtIn ? null : siteId }, { session });

  if (!role) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Role is unavailable for this scope');
  }
  await db.collection<IRoleAssignmentRecord>('role_assignments').insertOne({
    _id: randomUUID(), actorId, roleId, scope, siteId, createdAt: at, createdBy: initialRole?.grantedBy ?? null,
  }, { session });
}
