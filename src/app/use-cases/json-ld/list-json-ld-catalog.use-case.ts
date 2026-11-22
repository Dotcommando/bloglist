import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IListJsonLdCatalog } from '../../../ports/inbound/json-ld/json-ld-catalog.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IJsonLdCatalogReader } from '../../../ports/outbound/json-ld/json-ld-catalog.port.js';

export class ListJsonLdCatalogUseCase implements IListJsonLdCatalog {
  constructor(private readonly sites: IGetSite, private readonly store: IJsonLdCatalogReader) {}

  async execute(input: Parameters<IListJsonLdCatalog['execute']>[0]): ReturnType<IListJsonLdCatalog['execute']> {
    if ((await this.sites.execute(input))?.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    const catalog = await this.store.read(input.siteId);

    if (catalog.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign JSON-LD catalog');
    }

    return catalog;
  }
}
