import { validateElementIdentity } from '../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetRenderingElement } from '../../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IElementCatalog, IElementUsages } from '../../../ports/outbound/rendering/element-sources.port.js';

export class GetRenderingElementUseCase implements IGetRenderingElement {
  constructor(private readonly sites: IGetSite, private readonly catalog: IElementCatalog,
    private readonly usages: IElementUsages) {}

  async execute(input: Parameters<IGetRenderingElement['execute']>[0]): ReturnType<IGetRenderingElement['execute']> {
    const site = await this.sites.execute({ siteId: input.siteId });

    validateElementIdentity(input);
    const element = site?.siteId === input.siteId ? await this.catalog.find(input, input.authority) : null;

    if (element?.siteId !== input.siteId || element.kind !== input.kind || element.key !== input.key) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Element not found');
    }

    const usages = input.authority && !input.authority.scopes.includes('all') ? [] : await this.usages.find(input);

    return { ...element, usages };
  }
}
