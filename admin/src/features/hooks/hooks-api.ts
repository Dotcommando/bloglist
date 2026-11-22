import { HookKind } from '@zarya/addon-contracts/hooks';

import { object, request, string } from '../../shared/api/content-api';

export interface IHookHandlerView {
  handlerId: string;
  title: string;
  kind: HookKind;
  version: string;
  enabled: boolean;
  activeVersionId: string | null;
  draft: { source: string; capabilities: string[] };
}

export interface IHookBinding {
  subscriptionId: string;
  title: string;
  handlerId: string;
  hookKey: string;
  kind: HookKind;
  schemaVersion: number;
  version: string;
  enabled: boolean;
  priority: number;
  retrySafe: boolean;
  addonKey: string | null;
  handlerKey: string | null;
  ownerKind: string;
  configuration: Record<string, unknown>;
  filters: Record<string, unknown>;
  deliveryMode: string;
  manifestKey: string | null;
}

export interface IHookView {
  scopeKind: string;
  hookKey: string;
  title: string;
  description: string;
  provider: string;
  kind: HookKind;
  registeredAt: string;
  available: boolean;
  subscriptions: IHookBinding[];
}

function kind(value: unknown): HookKind {
  if (value !== HookKind.Check && value !== HookKind.Event) {
    throw new Error('Invalid hook kind');
  }

  return value;
}

export function readHandler(value: unknown): IHookHandlerView {
  const row = object(value);
  const draft = row.draft ? object(row.draft) : { source: '', capabilities: [] };

  if (typeof row.enabled !== 'boolean' || !Array.isArray(draft.capabilities)) {
    throw new Error('Invalid handler');
  }

  return {
    handlerId: string(row.handlerId),
    title: string(row.title),
    kind: kind(row.kind),
    version: string(row.version),
    enabled: row.enabled,
    activeVersionId: row.activeVersionId === null ? null : string(row.activeVersionId),
    draft: { source: string(draft.source), capabilities: draft.capabilities.map(string) },
  };
}

export async function loadHooks(siteId: string): Promise<{ hooks: IHookView[]; handlers: IHookHandlerView[] }> {
  const row = object(await request('/' + siteId + '/hooks'));

  if (!Array.isArray(row.hooks) || !Array.isArray(row.handlers)) {
    throw new Error('Invalid hook catalogue');
  }

  return {
    handlers: row.handlers.map(readHandler),
    hooks: row.hooks.map((value: unknown) => {
      const hook = object(value);

      if (!Array.isArray(hook.subscriptions) || typeof hook.available !== 'boolean') {
        throw new Error('Invalid hook registration');
      }

      return {
        scopeKind: string(hook.scopeKind),
        hookKey: string(hook.hookKey),
        title: string(hook.title),
        description: string(hook.description),
        provider: string(hook.provider),
        kind: kind(hook.kind),
        registeredAt: string(hook.registeredAt),
        available: hook.available,
        subscriptions: hook.subscriptions.map((value: unknown) => {
          const item = object(value);

          if (
            typeof item.priority !== 'number'
            || typeof item.schemaVersion !== 'number'
            || typeof
            item.enabled !== 'boolean'
          || typeof item.retrySafe !== 'boolean'
          ) {
            throw new Error('Invalid hook binding');
          }

          return {
            subscriptionId: string(item.subscriptionId),
            title: string(item.title),
            handlerId: string(item.handlerId),
            hookKey: string(item.hookKey),
            kind: kind(item.kind),
            schemaVersion: item.schemaVersion,
            version: string(item.version),
            enabled: item.enabled,
            priority: item.priority,
            retrySafe: item.retrySafe,
            addonKey: item.addonKey === null ? null : string(item.addonKey),
            handlerKey: item.handlerKey === null ? null : string(item.handlerKey),
            ownerKind: string(item.ownerKind),
            configuration: object(item.configuration),
            filters: object(item.filters),
            deliveryMode: string(item.deliveryMode),
            manifestKey: item.manifestKey === null ? null : string(item.manifestKey),
          };
        }),
      };
    }),
  };
}

export async function getHookHandler(siteId: string, handlerId: string): Promise<IHookHandlerView> {
  return readHandler(await request('/' + siteId + '/hooks/handlers/' + handlerId));
}

export async function saveHookBinding(siteId: string, binding: Omit<IHookBinding, 'version'>, expectedVersion:
  string | null): Promise<unknown> {
  const { ...subscription } = binding;

  return request('/' + siteId + '/hooks/subscriptions/save', { subscription, expectedVersion });
}

export async function reorderHookBindings(siteId: string, hookKey: string, ordered: readonly IHookBinding[]):
Promise<void> {
  await request('/' + siteId + '/hooks/subscriptions/reorder', {
    hookKey, ordered: ordered.map((item) => ({ id: item.subscriptionId, version: item.version })),
  });
}
