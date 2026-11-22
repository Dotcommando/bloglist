import { hookRequirement, HookScopeKind } from '../../../domain/hooks/hook.js';
import type { IReorderHookSubscriptions } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';

export class ReorderHookSubscriptionsUseCase implements IReorderHookSubscriptions {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort) {}

  async execute(input: Parameters<IReorderHookSubscriptions['execute']>[0]):
  ReturnType<IReorderHookSubscriptions['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const hook = (await this.store.tree(input.siteId)).hooks.find((item) => item.hookKey === input.hookKey);

    hookRequirement(hook?.scopeKind === HookScopeKind.Site, 'Installation hook ordering is code-owned');
    hookRequirement(Array.isArray(input.ordered) && input.ordered.length <= 128
      && new Set(input.ordered.map((item) => item.id)).size === input.ordered.length, 'Invalid subscription order');
    await this.store.reorder(input.siteId, input.hookKey, input.ordered);
  }
}
