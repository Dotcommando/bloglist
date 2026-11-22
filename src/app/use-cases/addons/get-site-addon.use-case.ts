import { type ISiteAddonView, requireAddonKey } from '../../../domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetSiteAddon, IGetSiteAddonInput } from '../../../ports/inbound/addons/get-site-addon.port.js';
import type { IAddonCatalogPort } from '../../../ports/outbound/addons/addon-catalog.port.js';
import type { ISiteAddonAccessPort } from '../../../ports/outbound/addons/site-addon-access.port.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';

export class GetSiteAddonUseCase implements IGetSiteAddon {
  constructor(private readonly store: ISiteAddonStorePort, private readonly catalog: IAddonCatalogPort,
    private readonly access: ISiteAddonAccessPort) {}

  async execute(input: IGetSiteAddonInput): Promise<ISiteAddonView> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireAddonKey(input.addonKey);
    const connection = await this.store.find(input.siteId, input.addonKey);
    const definition = this.catalog.find(input.addonKey);

    if (!connection && !definition) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Add-on not found');
    }
    if (connection && (connection.siteId !== input.siteId || connection.addonKey !== input.addonKey)) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign add-on connection');
    }

    return { addonKey: input.addonKey, definition, connection };
  }
}
