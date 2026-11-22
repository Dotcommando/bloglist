import {
  type ISiteAddonState, requireAddonKey, SiteAddon, SiteAddonStatus,
} from '../../../domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IEnableSiteAddon, IEnableSiteAddonInput } from '../../../ports/inbound/addons/enable-site-addon.port.js';
import type { IAddonAvailabilityPort } from '../../../ports/outbound/addons/addon-availability.port.js';
import type { IAddonCatalogPort } from '../../../ports/outbound/addons/addon-catalog.port.js';
import type {
  ISiteAddonAccessPort, ISiteAddonValuesPort,
} from '../../../ports/outbound/addons/site-addon-access.port.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class EnableSiteAddonUseCase implements IEnableSiteAddon {
  constructor(private readonly store: ISiteAddonStorePort, private readonly catalog: IAddonCatalogPort,
    private readonly access: ISiteAddonAccessPort, private readonly values: ISiteAddonValuesPort,
    private readonly availability: IAddonAvailabilityPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IEnableSiteAddonInput): Promise<ISiteAddonState> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireAddonKey(input.addonKey);
    this.catalog.validate(input.addonKey, input.configuration);
    await this.availability.requireAvailable(input.addonKey);
    const current = await this.store.find(input.siteId, input.addonKey);

    if (current && (current.siteId !== input.siteId || current.addonKey !== input.addonKey)) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign add-on connection');
    }
    if ((current?.version ?? null) !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Add-on connection changed');
    }
    if (
      current?.status === SiteAddonStatus.Enabled
      && JSON.stringify(current.configuration) === JSON.stringify(input.configuration)
    ) {
      return this.store.commit(current, input.expectedVersion);
    }

    const at = this.values.now();
    const next = new SiteAddon({
      siteAddonId: current?.siteAddonId ?? this.values.nextId(),
      siteId: input.siteId,
      addonKey: input.addonKey,
      status: SiteAddonStatus.Enabled,
      configuration: input.configuration,
      version: this.values.nextVersion(),
      createdAt: current?.createdAt ?? at,
      updatedAt: at,
      createdBy: current?.createdBy ?? input.actorId,
      updatedBy: input.actorId,
    }).toState();

    return this.store.commit(next, input.expectedVersion, await prepareCoreHook(this.hooks, input.siteId,
      'addon:' + input.addonKey, 'cms.addon.enable.check', { addonKey: input.addonKey }, 'cms.addon.enabled',
      input.actorId));
  }
}
