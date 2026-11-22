import { randomUUID } from 'node:crypto';

import type { IAddonActionDeclaration, IAddonAuthorizationDeclaration } from '@zarya/addon-contracts/addons';
import type { ClientSession, Connection, mongo } from 'mongoose';

import { AddonUpdateMode, AddonUpdatePhase, type IAddonUpdateState }
  from '../../../../../domain/addons/addon-update.js';
import { actionRouteKey, type ICatalogAction } from '../../../../../domain/authorization/action-catalog.js';
import { BuiltInRoleId } from '../../../../../domain/authorization/built-in-roles.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';

interface IStoredAddonAction extends ICatalogAction {
  readonly _id: string;
  readonly status: 'active' | 'retired';
  readonly allowedObjectScopes: readonly string[];
}

interface IStoredAddonDomain {
  readonly _id: string;
  readonly ownerKey: string;
  readonly status: 'active' | 'retired';
}

interface IStoredAddonActionGeneration {
  readonly _id: string;
  readonly digest: string;
  readonly guard: string;
}

export function sameAddonActionBoundary(previous: Omit<IStoredAddonAction, '_id' | 'status'>,
  next: IAddonActionDeclaration): boolean {
  return previous.actionId === next.actionId && previous.method === next.method && previous.route === next.route
    && previous.admission === next.admission && previous.scope === next.scope
    && previous.create === next.create && previous.read === next.read && previous.update === next.update
    && previous.delete === next.delete && previous.execute === next.execute
    && previous.allowedObjectScopes.length === next.allowedObjectScopes.length
    && next.allowedObjectScopes.every((scope) => previous.allowedObjectScopes.includes(scope));
}

function routesOverlap(left: string, right: string): boolean {
  const first = left.split('/');
  const second = right.split('/');
  const firstTail = first.at(-1)?.endsWith('*');
  const secondTail = second.at(-1)?.endsWith('*');

  return (first.length === second.length || first.length < second.length && firstTail
    || first.length > second.length && secondTail) === true
    && first.slice(0, second.length).every((part, index) =>
      part === second[index] || part.startsWith(':') || second[index]!.startsWith(':'));
}

export class MongooseAddonActionCatalog {
  constructor(private readonly connection: Connection) {}

  async validate(key: string, declaration: IAddonAuthorizationDeclaration, session?: ClientSession): Promise<void> {
    const db = this.connection.db!;
    const options = session ? { session } : undefined;
    const prefix = new RegExp('^' + key + '\\.');
    const current = await db.collection<IStoredAddonAction>('actions').find({
      $or: [{ status: 'active' }, { _id: prefix }],
    }, options).toArray();

    for (const action of declaration.actions) {
      const previous = current.find(({ _id }) => _id === action.actionId);

      if (previous && (previous.status === 'retired' || !sameAddonActionBoundary(previous, action))) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Use a new Action ID for a changed or retired operation');
      }
      if (
        current.some((entry) => entry.status === 'active' && entry.route.startsWith('/api/')
        && !prefix.test(entry.actionId)
        && entry.method === action.method && routesOverlap(entry.route, action.route))
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Add-on Action conflicts with a registered route');
      }
    }
  }

  async initialize(key: string, digest: string, declaration: IAddonAuthorizationDeclaration,
    select: () => Promise<void>): Promise<void> {
    await this.connection.transaction(async (session) => {
      await this.lockCatalog(digest, session);
      const current = await this.generations().findOne({ _id: 'addon:' + key }, { session });

      if (current && current.digest !== digest) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'An installed package version is immutable');
      }
      if (!current) {
        await this.publish(key, digest, declaration, session);
      }
      await select();
    });
  }

  async activate(key: string, digest: string, declaration: IAddonAuthorizationDeclaration,
    session: ClientSession): Promise<void> {
    await this.lockCatalog(digest, session);
    await this.publish(key, digest, declaration, session);
  }

  async confirmed(key: string, digest: string): Promise<boolean> {
    return await this.generations().findOne({ _id: 'addon:' + key, digest }) !== null;
  }

  async admitted(key: string, digest: string, action: IAddonActionDeclaration,
    session?: ClientSession): Promise<boolean> {
    const options = session ? { session } : undefined;
    const generation = await this.generations().findOne({ _id: 'addon:' + key }, options);

    if (!generation) {
      return false;
    }

    const stored = await this.connection.db!.collection<IStoredAddonAction>('actions')
      .findOne({ _id: action.actionId, status: 'active' }, options);

    if (!stored || !sameAddonActionBoundary(stored, action)) {
      return false;
    }

    const matchesGeneration = generation.digest === digest;
    const matchesCompatibleUpdate = !matchesGeneration
      && await this.matchesCompatibleUpdate(key, digest, generation.digest, session);

    if (session && (matchesGeneration || matchesCompatibleUpdate)) {
      await this.generations().updateOne({ _id: generation._id, digest: generation.digest }, {
        $set: { guard: randomUUID() },
      }, { session });
    }

    return matchesGeneration || matchesCompatibleUpdate;
  }

  private async matchesCompatibleUpdate(key: string, runtimeDigest: string, catalogDigest: string,
    session?: ClientSession): Promise<boolean> {
    const options = session ? { session } : undefined;
    const control = await this.connection.db!.collection<{
      _id: string; paused: boolean; state: IAddonUpdateState | null;
    }>('addon_runtime_controls').findOne({
      _id: key,
      paused: false,
      'state.mode': AddonUpdateMode.Compatible,
      $or: [
        {
          'state.phase': AddonUpdatePhase.Activating,
          'state.fromDigest': catalogDigest,
          'state.toDigest': runtimeDigest,
        },
        {
          'state.phase': AddonUpdatePhase.Completed,
          'state.fromDigest': runtimeDigest,
          'state.toDigest': catalogDigest,
        },
      ],
    }, options);

    return control?.state?.addonKey === key;
  }

  private generations(): mongo.Collection<IStoredAddonActionGeneration> {
    return this.connection.db!.collection<IStoredAddonActionGeneration>('addon_action_generations');
  }

  private async lockCatalog(digest: string, session: ClientSession): Promise<void> {
    await this.generations().updateOne({ _id: 'catalog' }, { $set: { guard: randomUUID(), digest } },
      { session, upsert: true });
  }

  private async publish(key: string, digest: string, declaration: IAddonAuthorizationDeclaration,
    session: ClientSession): Promise<void> {
    await this.validate(key, declaration, session);
    const db = this.connection.db!;
    const actions = db.collection<IStoredAddonAction>('actions');
    const domains = db.collection<IStoredAddonDomain>('action_domains');
    const permissions = db.collection('role_permissions');
    const prefix = new RegExp('^' + key + '\\.');
    const at = new Date();

    await actions.updateMany({
      actionId: { $regex: prefix, $nin: declaration.actions.map((action) => action.actionId) },
      status: 'active',
    }, { $set: { status: 'retired' } }, { session });
    await domains.updateMany({ ownerKey: key, _id: { $nin: declaration.domains.map((domain) => domain.domainId) } },
      { $set: { status: 'retired' } }, { session });

    for (const domain of declaration.domains) {
      await domains.updateOne({ _id: domain.domainId }, { $set: { ...domain, ownerKey: key, status: 'active' } },
        { session, upsert: true });
    }

    for (const action of declaration.actions) {
      await actions.updateOne({ _id: action.actionId }, {
        $set: { ...action, routeKey: actionRouteKey(action.route), status: 'active' },
      }, { session, upsert: true });

      if (action.admission === 'admin') {
        for (const roleId of [BuiltInRoleId.SystemAdmin, BuiltInRoleId.SiteAdmin]) {
          await permissions.updateOne({ siteId: null, roleId, actionId: action.actionId }, {
            $setOnInsert: {
              _id: randomUUID(),
              objectScopes: ['all'],
              createdAt: at,
              updatedAt: at,
              createdBy: null,
              updatedBy: null,
            },
          }, { session, upsert: true });
        }
      }
    }
    await this.generations().updateOne({ _id: 'addon:' + key }, { $set: { digest, guard: randomUUID() } },
      { session, upsert: true });
  }
}
