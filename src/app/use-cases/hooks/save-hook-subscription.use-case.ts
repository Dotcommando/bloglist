import { hookRequirement, HookScopeKind, validateHookObject, validateHookTitle } from '../../../domain/hooks/hook.js';
import type { ISaveHookSubscription } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore, IHookValuesPort } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';

export class SaveHookSubscriptionUseCase implements ISaveHookSubscription {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort,
    private readonly values: IHookValuesPort) {}

  async execute(input: Parameters<ISaveHookSubscription['execute']>[0]): ReturnType<ISaveHookSubscription['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const requested = input.subscription;
    const tree = await this.store.tree(input.siteId);
    const hook = tree.hooks.find((item) => item.hookKey === requested.hookKey && item.schemaVersion
      === requested.schemaVersion);
    const handler = await this.store.handler(input.siteId, requested.handlerId);

    hookRequirement(requested.ownerKind === 'User' && requested.addonKey === null && requested.handlerKey === null
      && requested.manifestKey === null, 'Add-on bindings are code-owned');
    hookRequirement(hook?.available && hook.scopeKind === HookScopeKind.Site && handler?.siteId
      === input.siteId && hook.kind === handler.kind
      && hook.kind === requested.kind, 'Incompatible hook or handler');
    hookRequirement(!requested.enabled || handler.enabled && handler.activeVersionId !== null,
      'Handler is unavailable');
    hookRequirement(Number.isSafeInteger(requested.priority) && requested.priority >= 0
      && requested.priority <= 1000000 && typeof requested.enabled === 'boolean'
      && typeof requested.retrySafe === 'boolean' && ['Event', 'Detail'].includes(requested.deliveryMode)
      && (requested.deliveryMode !== 'Detail' || requested.hookKey === 'cms.routing.changed'),
    'Invalid subscription policy');
    validateHookTitle(requested.title);
    validateHookObject(requested.configuration);
    validateHookObject(requested.filters);
    hookRequirement(Object.values(requested.filters).every((value) => value === null || ['string', 'number',
      'boolean'].includes(typeof value)),
    'Filters require scalar equality values');
    const previous = tree.hooks.flatMap((item) => item.subscriptions)
      .find((item) => item.subscriptionId === requested.subscriptionId);
    const at = this.values.now();
    const next = {
      ...requested,
      subscriptionId: requested.subscriptionId || this.values.id(),
      siteId: input.siteId,
      version: this.values.id(),
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
      createdBy: previous?.createdBy ?? input.actorId,
      updatedBy: input.actorId,
    };

    await this.store.saveSubscription(next, input.expectedVersion);

    return next;
  }
}
