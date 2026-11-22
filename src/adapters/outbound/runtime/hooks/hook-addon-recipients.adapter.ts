import { coreHookDefinitions } from '../../../../domain/hooks/core-hook-definitions.js';
import type { IHookAddonBinding } from '../../../../ports/outbound/hooks/hook-recipient-source.port.js';
import { hookDigest } from '../../shared/hook-digest.js';
import type { HookAddonRegistry } from './hook-addon-registry.js';

/** Translates code descriptors to stable recipient identities without selecting consumers. */
export class HookAddonRecipientsAdapter {
  constructor(private readonly addons: HookAddonRegistry) {}

  async read(siteId: string | null): Promise<readonly IHookAddonBinding[]> {
    const definitions = [...coreHookDefinitions, ...this.addons.definitions()];

    return this.addons.bindings().map((binding) => ({
      definition: definitions.find((item) => item.hookKey === binding.handler.hookKey) ?? null,
      recipient: {
        subscriptionId: hookDigest([siteId, binding.addonKey, binding.handler.key]),
        consumerId: hookDigest([binding.addonKey, binding.handler.key]),
        hookKey: binding.handler.hookKey,
        kind: binding.handler.kind,
        priority: binding.handler.priority,
        versionId: binding.addonKey + ':' + binding.digest + ':' + binding.handler.key,
        addonKey: binding.addonKey,
        configuration: {},
        capabilities: binding.handler.capabilities,
        retrySafe: binding.handler.retrySafe,
        deliveryMode: 'Event',
      },
    }));
  }
}
