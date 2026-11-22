import type { ClientSession } from 'mongoose';

import type {
  IHookAddonBinding, IHookRecipientSourcePort,
} from '../../../../../ports/outbound/hooks/hook-recipient-source.port.js';
import type { MongooseHookConfiguration } from './hook-configuration.adapter.js';

export class MongooseHookRecipientSource implements IHookRecipientSourcePort {
  constructor(private readonly configuration: MongooseHookConfiguration,
    private readonly enabled: (siteId: string, addonKey: string, session?: ClientSession) => Promise<boolean>,
    private readonly bindings: (siteId: string | null) => Promise<readonly IHookAddonBinding[]>,
    private readonly session?: ClientSession) {}

  tree(siteId: string): ReturnType<IHookRecipientSourcePort['tree']> {
    return this.configuration.tree(siteId, this.session);
  }

  version(siteId: string, versionId: string): ReturnType<IHookRecipientSourcePort['version']> {
    return this.configuration.version(siteId, versionId, this.session);
  }

  addonEnabled(siteId: string, addonKey: string): Promise<boolean> {
    return this.enabled(siteId, addonKey, this.session);
  }

  addons(siteId: string | null): ReturnType<IHookRecipientSourcePort['addons']> {
    return this.bindings(siteId);
  }
}
