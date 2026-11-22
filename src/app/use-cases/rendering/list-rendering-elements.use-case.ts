import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IListRenderingElements } from '../../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IElementCatalog } from '../../../ports/outbound/rendering/element-sources.port.js';

export class ListRenderingElementsUseCase implements IListRenderingElements {
  constructor(private readonly sites: IGetSite, private readonly catalog: IElementCatalog) {}

  async execute(input: Parameters<IListRenderingElements['execute']>[0]):
  ReturnType<IListRenderingElements['execute']> {
    const site = await this.sites.execute({ siteId: input.siteId });

    if (site?.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    const items = await this.catalog.list(input.siteId, input.kind, input.authority);

    if (items.some((item) => item.siteId !== input.siteId || item.kind !== input.kind)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign rendering elements');
    }

    return items;
  }
}
