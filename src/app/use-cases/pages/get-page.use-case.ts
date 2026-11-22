import { Page } from '../../../domain/pages/page.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IGetPage, IGetPageInput } from '../../../ports/inbound/pages/get-page.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';

export class GetPageUseCase implements IGetPage {
  constructor(private readonly repository: IPageRepository, private readonly access: IPageAccessPort) {}

  async execute(input: IGetPageInput): Promise<Page | null> {
    await this.access.assertCanReadPage(input.siteId);
    requireText(input.siteId, 'siteId');
    requireText(input.pageId, 'pageId');
    const page = await this.repository.findById(input.pageId, input.authority);

    if (page && (page.pageId !== input.pageId || page.siteId !== input.siteId)) {
      throw new PageScopeError('Page identity or site does not match');
    }

    return page ? new Page(page.toState()) : null;
  }
}
