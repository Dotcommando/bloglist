import {
  type ISiteAddonState, requireAddonKey, SiteAddon, SiteAddonStatus,
} from '../../../domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IDisableSiteAddon, IDisableSiteAddonInput,
} from '../../../ports/inbound/addons/disable-site-addon.port.js';
import type {
  ISiteAddonAccessPort, ISiteAddonValuesPort,
} from '../../../ports/outbound/addons/site-addon-access.port.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class DisableSiteAddonUseCase implements IDisableSiteAddon {
  constructor(private readonly store: ISiteAddonStorePort, private readonly access: ISiteAddonAccessPort,
    private readonly values: ISiteAddonValuesPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IDisableSiteAddonInput): Promise<ISiteAddonState> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireAddonKey(input.addonKey);
    const current = await this.store.find(input.siteId, input.addonKey);

    if (!current) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Connection not found');
    }
    if (current.siteId !== input.siteId || current.addonKey !== input.addonKey) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign connection');
    }
    if (current.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Connection changed');
    }

    const next = current.status === SiteAddonStatus.Disabled ? current : new SiteAddon({
      ...current,
      status: SiteAddonStatus.Disabled,
      version: this.values.nextVersion(),
      updatedAt: this.values.now(),
      updatedBy: input.actorId,
    }).toState();

    return this.store.commit(next, input.expectedVersion, current.status === SiteAddonStatus.Disabled ? undefined
      : await prepareCoreHook(this.hooks, input.siteId, 'addon:' + input.addonKey, '', { addonKey: input.addonKey },
        'cms.addon.disabled', input.actorId));
  }
}
