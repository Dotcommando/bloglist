import { PageScopeError } from '../../../../domain/pages/page-scope.error.js';
import type { IPageReference } from '../../../../domain/routing/page-reference.js';
import { RoutingScopeError } from '../../../../domain/routing/routing-scope.error.js';
import type { IGetPage } from '../../../../ports/inbound/pages/get-page.port.js';
import type { IPageLookupPort } from '../../../../ports/outbound/routing/page-lookup.port.js';

export class RoutingPageLookupAdapter implements IPageLookupPort {
  constructor(private readonly getPage: IGetPage) {}

  async findPage(siteId: string, pageId: string): Promise<IPageReference | null> {
    try {
      const page = await this.getPage.execute({ siteId, pageId });

      if (page && (page.siteId !== siteId || page.pageId !== pageId)) {
        throw new RoutingScopeError('Inconsistent page lookup result');
      }

      return page ? { siteId: page.siteId, pageId: page.pageId } : null;
    } catch (error) {
      if (error instanceof PageScopeError) {
        throw new RoutingScopeError('Page belongs to another site');
      }
      throw error;
    }
  }
}
