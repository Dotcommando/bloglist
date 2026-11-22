import type { IAddonObject } from '@zarya/addon-contracts/addons';

import { HookScopeKind } from '../../../domain/hooks/hook.js';
import type { IHookRecipient } from '../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IHookRecipientSourcePort } from '../../../ports/outbound/hooks/hook-recipient-source.port.js';

/** Shared selection for normal source capture and transactional restoration. */
export class HookRecipientsService {
  constructor(private readonly source: IHookRecipientSourcePort) {}

  async select(siteId: string | null, hookKeys: readonly string[], candidate: IAddonObject):
  Promise<readonly IHookRecipient[]> {
    const tree = siteId ? await this.source.tree(siteId) : { hooks: [], handlers: [] };
    const recipients: IHookRecipient[] = [];

    for (const hook of tree.hooks.filter((item) => hookKeys.includes(item.hookKey))) {
      if (!hook.available) {
        continue;
      }

      for (const subscription of hook.subscriptions) {
        if (
          !subscription.enabled
          || subscription.addonKey
          && !await this.source.addonEnabled(siteId!, subscription.addonKey)
          || Object.entries(subscription.filters).some(([key, value]) => candidate[key] !== value)
        ) {
          continue;
        }
        if (subscription.ownerKind === 'Addon') {
          continue;
        }

        const handler = tree.handlers.find((item) => item.handlerId === subscription.handlerId);

        if (!handler?.enabled) {
          continue;
        }

        const version = handler.activeVersionId
          ? await this.source.version(siteId!, handler.activeVersionId) : null;

        if (!version) {
          throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Applied hook implementation unavailable');
        }
        recipients.push({
          subscriptionId: subscription.subscriptionId,
          consumerId: handler.handlerId,
          hookKey: hook.hookKey,
          kind: hook.kind,
          priority: subscription.priority,
          versionId: version.versionId,
          addonKey: null,
          configuration: subscription.configuration,
          capabilities: version.capabilities,
          retrySafe: subscription.retrySafe,
          deliveryMode: subscription.deliveryMode,
        });
      }
    }

    for (const { definition, recipient } of await this.source.addons(siteId)) {
      if (
        !definition
        || !hookKeys.includes(definition.hookKey)
        || (definition.scopeKind === HookScopeKind.Site) !== (siteId !== null)
        || siteId !== null
        && (hookKeys.includes('cms.addon.disabled')
        && candidate.addonKey === recipient.addonKey
          || !await this.source.addonEnabled(siteId, recipient.addonKey!)
        && !(hookKeys.includes('cms.addon.enabled')
            && candidate.addonKey === recipient.addonKey))
      ) {
        continue;
      }
      if (siteId) {
        const binding = tree.hooks.flatMap((item) => item.subscriptions)
          .find((item) => item.subscriptionId === recipient.subscriptionId);

        if (binding) {
          recipients.push({ ...recipient, priority: binding.priority, configuration: binding.configuration });
        } else if (hookKeys.includes('cms.addon.enabled') && candidate.addonKey === recipient.addonKey) {
          recipients.push(recipient);
        }
      } else {
        recipients.push(recipient);
      }
    }
    const counts = new Map<string, number>();

    for (const recipient of recipients) {
      const count = (counts.get(recipient.hookKey) ?? 0) + 1;

      if (count > 128) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Too many hook bindings');
      }
      counts.set(recipient.hookKey, count);
    }

    return recipients.sort((a, b) => a.priority - b.priority || a.subscriptionId.localeCompare(b.subscriptionId));
  }
}
