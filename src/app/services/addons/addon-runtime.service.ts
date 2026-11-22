import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IAddonAvailabilityPort } from '../../../ports/outbound/addons/addon-availability.port.js';
import type { IAddonCatalogPort } from '../../../ports/outbound/addons/addon-catalog.port.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';

export class AddonRuntimeService {
  constructor(private readonly store: ISiteAddonStorePort, private readonly catalog: IAddonCatalogPort,
    private readonly availability: IAddonAvailabilityPort) {}

  async validate(): Promise<void> {
    for (const connection of await this.store.listEnabled()) {
      const definition = this.catalog.find(connection.addonKey);

      if (definition?.contractVersion !== 1) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Unsupported enabled add-on');
      }
      this.catalog.validate(connection.addonKey, connection.configuration);
      await this.availability.requireAvailable(connection.addonKey);
    }
  }
}
