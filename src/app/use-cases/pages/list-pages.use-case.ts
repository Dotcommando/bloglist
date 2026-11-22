import { Page } from '../../../domain/pages/page.js';
import type { IPageFilter } from '../../../domain/pages/page-filter.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { PageType } from '../../../domain/pages/page-type.enum.js';
import { requireCondition, requireText } from '../../../domain/shared/validation.js';
import type { IListPages, IListPagesInput } from '../../../ports/inbound/pages/list-pages.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';

export class ListPagesUseCase implements IListPages {
  constructor(private readonly pages: IPageRepository, private readonly access: IPageAccessPort) {}

  async execute(input: IListPagesInput): Promise<Page[]> {
    await this.access.assertCanReadPage(input.siteId);
    requireText(input.siteId, 'siteId');
    const filter: IPageFilter = {};

    if (input.filter) {
      requireCondition(Object.keys(input.filter).every((key) => ['clusterId', 'language',
        'type', 'status'].includes(key)),
      'Unknown page filter');

      if (input.filter.clusterId !== undefined) {
        if (input.filter.clusterId !== null) {
          requireText(input.filter.clusterId, 'clusterId');
        }
        filter.clusterId = input.filter.clusterId;
      }
      if (input.filter.language !== undefined) {
        const language = input.filter.language.trim().toLowerCase();

        requireCondition(/^[a-z]{2}$/.test(language), 'Invalid language filter');
        filter.language = language;
      }
      if (input.filter.status !== undefined) {
        requireCondition(Object.values(PageStatus).includes(input.filter.status), 'Invalid status filter');
        filter.status = input.filter.status;
      }
      if (input.filter.type !== undefined) {
        requireCondition(Object.values(PageType).includes(input.filter.type), 'Invalid type filter');
        filter.type = input.filter.type;
      }
    }

    const pages = await this.pages.findBySite(input.siteId, filter, input.authority);

    if (
      new Set(pages.map((page) => page.pageId)).size !== pages.length
      || pages.some((page) =>
        page.siteId !== input.siteId || (filter.clusterId !== undefined && page.clusterId !== filter.clusterId)
      || (filter.language !== undefined && page.language !== filter.language)
      || (filter.status !== undefined && page.status !== filter.status)
      || (filter.type !== undefined && page.type !== filter.type))
    ) {
      throw new PageScopeError('Inconsistent owned page list');
    }

    return pages.map((page) => new Page(page.toState()));
  }
}
