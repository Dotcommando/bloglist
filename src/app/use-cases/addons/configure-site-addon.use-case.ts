import { type ISiteAddonState, requireAddonKey, SiteAddon } from '../../../domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IConfigureSiteAddon, IConfigureSiteAddonInput,
} from '../../../ports/inbound/addons/configure-site-addon.port.js';
import type { IAddonAvailabilityPort } from '../../../ports/outbound/addons/addon-availability.port.js';
import type { IAddonCatalogPort } from '../../../ports/outbound/addons/addon-catalog.port.js';
import type {
  ISiteAddonAccessPort, ISiteAddonValuesPort,
} from '../../../ports/outbound/addons/site-addon-access.port.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class ConfigureSiteAddonUseCase implements IConfigureSiteAddon {
  constructor(private readonly store: ISiteAddonStorePort, private readonly catalog: IAddonCatalogPort,
    private readonly access: ISiteAddonAccessPort, private readonly values: ISiteAddonValuesPort,
    private readonly availability: IAddonAvailabilityPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IConfigureSiteAddonInput): Promise<ISiteAddonState> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireAddonKey(input.addonKey);
    this.catalog.validate(input.addonKey, input.configuration);
    await this.availability.requireAvailable(input.addonKey);
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

    const equal = JSON.stringify(current.configuration) === JSON.stringify(input.configuration);
    const next = equal ? current : new SiteAddon({
      ...current,
      configuration: input.configuration,
      version: this.values.nextVersion(),
      updatedAt: this.values.now(),
      updatedBy: input.actorId,
    }).toState();

    return this.store.commit(next, input.expectedVersion, equal ? undefined : await
    prepareCoreHook(this.hooks, input.siteId,
      'addon:' + input.addonKey, 'cms.addon.configure.check', { addonKey: input.addonKey },
      'cms.addon.configuration.changed', input.actorId));
  }
}
