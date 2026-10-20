import type { Page } from '../../../domain/pages/page.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type { IGetPage, IGetPageInput } from '../../../ports/inbound/pages/get-page.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';

export class GetPageUseCase implements IGetPage {
  constructor(private readonly pages: IPageRepository) {}

  async execute(input: IGetPageInput): Promise<Page | null> {
    const page = await this.pages.findById(input.pageId);

    if (page && page.siteId !== input.siteId) {
      throw new PageScopeError('Page belongs to another site');
    }

    return page;
  }
}
