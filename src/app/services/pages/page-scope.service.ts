import { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';

export class PageScopeService {
  constructor(private readonly pages: IPageRepository) {}

  async requirePage(siteId: string, pageId: string): Promise<Page> {
    const page = await this.pages.findById(pageId);

    if (!page) {
      throw new PageNotFoundError('Page was not found');
    }
    if (page.siteId !== siteId) {
      throw new PageScopeError('Page belongs to another site');
    }

    return new Page(page.toState());
  }
}
