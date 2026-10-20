import type { Page } from '../../../domain/pages/page.js';
import type { IArchivePage, IArchivePageInput } from '../../../ports/inbound/pages/archive-page.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { PageScopeService } from '../../services/pages/page-scope.service.js';

export class ArchivePageUseCase implements IArchivePage {
  constructor(
    private readonly pages: IPageRepository,
    private readonly scope: PageScopeService,
  ) {}

  async execute(input: IArchivePageInput): Promise<Page> {
    const page = await this.scope.requirePage(input.siteId, input.pageId);

    page.archive();

    return this.pages.save(page);
  }
}
