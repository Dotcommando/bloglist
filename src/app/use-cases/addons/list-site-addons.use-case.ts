import type { ISiteAddonView } from '../../../domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IListSiteAddons, IListSiteAddonsInput } from '../../../ports/inbound/addons/list-site-addons.port.js';
import type { IAddonCatalogPort } from '../../../ports/outbound/addons/addon-catalog.port.js';
import type { ISiteAddonAccessPort } from '../../../ports/outbound/addons/site-addon-access.port.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';

export class ListSiteAddonsUseCase implements IListSiteAddons {
  constructor(private readonly store: ISiteAddonStorePort, private readonly catalog: IAddonCatalogPort,
    private readonly access: ISiteAddonAccessPort) {}

  async execute(input: IListSiteAddonsInput): Promise<readonly ISiteAddonView[]> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const connections = await this.store.list(input.siteId);

    if (connections.some((item) => item.siteId !== input.siteId)) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign add-on connection');
    }

    const keys = new Set([
      ...this.catalog.list().map((item) => item.addonKey),
      ...connections.map((item) => item.addonKey),
    ]);

    return [...keys].sort().map((addonKey) => ({
      addonKey,
      definition: this.catalog.find(addonKey),
      connection: connections.find((item) => item.addonKey === addonKey) ?? null,
    }));
  }
}
