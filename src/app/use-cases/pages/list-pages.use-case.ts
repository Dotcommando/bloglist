import type { Page } from '../../../domain/pages/page.js';
import type { IPageFilter } from '../../../domain/pages/page-filter.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type { IListPages, IListPagesInput } from '../../../ports/inbound/pages/list-pages.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';

export class ListPagesUseCase implements IListPages {
  constructor(private readonly pages: IPageRepository) {}

  async execute(input: IListPagesInput): Promise<Page[]> {
    let filter: IPageFilter | undefined;

    if (input.filter !== undefined) {
      filter = {};

      if (input.filter.clusterId !== undefined) {
        filter.clusterId = input.filter.clusterId;
      }
      if (input.filter.language !== undefined) {
        filter.language = input.filter.language;
      }
      if (input.filter.type !== undefined) {
        filter.type = input.filter.type;
      }
      if (input.filter.status !== undefined) {
        filter.status = input.filter.status;
      }
    }

    const pages = await this.pages.findBySite(input.siteId, filter);

    if (pages.some((page) => page.siteId !== input.siteId)) {
      throw new PageScopeError('Page list contains a page from another site');
    }

    return pages;
  }
}
