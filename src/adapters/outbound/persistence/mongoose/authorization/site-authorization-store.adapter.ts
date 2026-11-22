import { randomUUID } from 'node:crypto';

import type { ClientSession, Connection } from 'mongoose';

import type { ICatalogAction, ISiteAuthorizationView } from '../../../../../domain/authorization/action-catalog.js';
import { BuiltInRoleId, defaultManagerActionIds } from '../../../../../domain/authorization/built-in-roles.js';
import type {
  IContentGroupAssignment, ObjectGrants, ObjectScope,
} from '../../../../../domain/authorization/content-access.js';
import type { SiteGroupChange, SiteRoleChange } from '../../../../../domain/authorization/site-role.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type {
  ISiteAuthorizationStore,
} from '../../../../../ports/outbound/authorization/site-authorization-store.port.js';
import { requireSiteAdministrator } from './admin-authority.adapter.js';
import { requireActiveContentGroup, writeAuthorizationGuard } from './content-access.adapter.js';
import { changeCustomSiteRole, readCustomSiteRoles } from './custom-site-roles.js';
import { changeSiteGroup, readSiteGroups } from './site-access-groups.js';

interface IStoredAction extends ICatalogAction {
  readonly _id: string;
  readonly status: 'active' | 'retired';
  readonly allowedObjectScopes: readonly ObjectScope[];
}

interface IStoredPermission {
  readonly _id: string;
  readonly siteId: string | null;
  readonly roleId: string;
  readonly actionId: string;
  readonly objectScopes: readonly ObjectScope[];
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

interface IAuthorizationGuard {
  readonly _id: string;
  readonly revision: string;
  readonly writeGuard: string;
}

export class MongooseSiteAuthorizationStore implements ISiteAuthorizationStore {
  constructor(private readonly connection: Connection) {}

  async read(siteId: string, installation: boolean): Promise<ISiteAuthorizationView> {
    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(() => this.snapshot(siteId, installation, session), {
        readConcern: { level: 'snapshot' },
      });
    } finally {
      await session.endSession();
    }
  }

  async save(siteId: string, actorId: string, revision: string | null,
    actionIds: readonly string[], scopes: ObjectGrants,
    role?: SiteRoleChange, group?: SiteGroupChange): Promise<ISiteAuthorizationView> {
    const db = this.connection.db!;
    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        const authority = await requireSiteAdministrator(db, actorId, siteId, 'cms.authorization.save', session);

        await writeAuthorizationGuard(db, 'actor:' + actorId, session);

        const current = await this.snapshot(siteId, authority.systemAdmin, session);

        if (current.revision !== revision) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site permissions changed');
        }
        if (
          actionIds.some((id) => {
            const action = current.actions.find((item) => item.actionId === id);

            return !current.delegableActionIds.includes(id)
            || (scopes[id] ?? ['all']).some((scope) => !action?.allowedObjectScopes.includes(scope));
          })
        ) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Action cannot be delegated on this site');
        }

        await writeAuthorizationGuard(db, 'site:' + siteId, session, true);

        if (group) {
          await changeSiteGroup(db, { siteId, actorId, change: group, siteActors: current.siteActors }, session);

          return this.snapshot(siteId, authority.systemAdmin, session);
        }

        const roleId = role ? await changeCustomSiteRole(db, {
          siteId, actorId, change: role, siteActors: current.siteActors,
        }, session) : BuiltInRoleId.Manager;

        if (roleId === BuiltInRoleId.Manager) {
          await db.collection<{ _id: string }>('manager_permission_overrides').updateOne({ _id: siteId },
            { $setOnInsert: { _id: siteId } }, { session, upsert: true });
        }

        const filter = { siteId, roleId };
        const permissions = db.collection<IStoredPermission>('role_permissions');
        const at = new Date();

        await permissions.deleteMany({ ...filter, actionId: { $nin: [...actionIds] } }, { session });

        if (actionIds.length) {
          await permissions.bulkWrite(actionIds.map((actionId) => ({
            updateOne: {
              filter: { ...filter, actionId },
              update: {
                $setOnInsert: { _id: randomUUID(), createdAt: at, createdBy: actorId },
                $set: { objectScopes: scopes[actionId] ?? ['all'], updatedAt: at, updatedBy: actorId },
              },
              upsert: true,
            },
          })), { session });
        }

        return this.snapshot(siteId, authority.systemAdmin, session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally {
      await session.endSession();
    }
  }

  async setContentGroup(siteId: string, actorId: string, assignment: IContentGroupAssignment): Promise<void> {
    const db = this.connection.db!;
    const session = await this.connection.startSession();
    const { domain, objectId, accessGroupId } = assignment;
    const collection = domain === 'pages' ? 'pages' : 'rendering_elements';
    const filter = domain === 'pages' ? { siteId, _id: objectId }
      : { siteId, kind: domain === 'chunks' ? 'Chunk' : 'Snippet', key: objectId };

    try {
      await session.withTransaction(async () => {
        await requireSiteAdministrator(db, actorId, siteId, 'cms.authorization.set-content-group', session);
        await writeAuthorizationGuard(db, 'actor:' + actorId, session);
        await writeAuthorizationGuard(db, 'site:' + siteId, session);
        await requireActiveContentGroup(db, siteId, accessGroupId, session);

        const result = await db.collection<{ _id: string; siteId: string; accessGroupId?: string | null }>(collection)
          .updateOne(filter, { $set: { accessGroupId } }, { session });

        if (result.matchedCount !== 1) {
          throw new BusinessError(BusinessErrorCode.NotFound, 'Content object not found in this site');
        }
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally {
      await session.endSession();
    }
  }

  private async snapshot(siteId: string, installation: boolean,
    session: ClientSession): Promise<ISiteAuthorizationView> {
    const db = this.connection.db!;

    if (!await db.collection<{ _id: string }>('sites').findOne({ _id: siteId }, { session })) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    const guard = await db.collection<IAuthorizationGuard>('authorization_guards').findOne({ _id: 'site:' + siteId },
      { session });
    const rows = await db.collection<IStoredAction>('actions').find({
      status: 'active', ...(installation ? {} : { scope: 'site' }),
    }, { session, projection: { _id: 0, status: 0, routeKey: 0 } }).sort({ actionId: 1 }).toArray();
    const delegableActionIds = rows
      .filter((action) => action.scope === 'site' && action.admission === 'admin'
        && action.allowedObjectScopes.length > 0)
      .map((action) => action.actionId);
    const administratorRoles = [BuiltInRoleId.SystemAdmin, BuiltInRoleId.SiteAdmin];
    const permissions = db.collection<IStoredPermission>('role_permissions');
    const adminGrants = await permissions.find({
      siteId: null,
      roleId: { $in: administratorRoles },
      actionId: { $in: rows.map(({ actionId }) => actionId) },
      objectScopes: ['all'],
    }, { session }).toArray();
    const administratorActionIds = Object.fromEntries(administratorRoles.map((roleId) => [
      roleId, adminGrants.filter((grant) => grant.roleId === roleId).map(({ actionId }) => actionId),
    ]));
    const grants = await permissions.find({ siteId }, { session }).sort({ actionId: 1 }).toArray();
    const enabled = new Set(delegableActionIds);
    const activeGrants = grants.filter(({ actionId }) => enabled.has(actionId));
    const roles = await readCustomSiteRoles(db, siteId, session, activeGrants);
    const groups = await readSiteGroups(db, siteId, roles.siteActors, session, installation);
    const managerGrants = activeGrants.filter(({ roleId }) => roleId === BuiltInRoleId.Manager);
    const explicit = grants.some(({ roleId }) => roleId === BuiltInRoleId.Manager)
      || await db.collection<{ _id: string }>('manager_permission_overrides').findOne({ _id: siteId }, { session });
    const managerObjectScopes = explicit
      ? Object.fromEntries(managerGrants.map(({ actionId, objectScopes }) => [actionId, objectScopes]))
      : Object.fromEntries(defaultManagerActionIds.filter((id) => enabled.has(id)).map((id) => [id, ['all'] as const]));

    return {
      revision: guard?.revision ?? null,
      actions: rows,
      delegableActionIds,
      administratorActionIds,
      managerActionIds: Object.keys(managerObjectScopes),
      managerObjectScopes,
      ...roles,
      groups,
    };
  }
}
