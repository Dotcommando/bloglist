import { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IArchivePage, IArchivePageInput } from '../../../ports/inbound/pages/archive-page.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import type { IPageArchivalPort } from '../../../ports/outbound/pages/page-archival.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class ArchivePageUseCase implements IArchivePage {
  constructor(private readonly pages: IPageRepository, private readonly archival: IPageArchivalPort,
    private readonly access: Pick<IPageAccessPort, 'assertCanUpdatePage'>, private readonly hooks: IHookChangesPort) {}

  async execute(input: IArchivePageInput): Promise<Page> {
    await this.access.assertCanUpdatePage(input.siteId);
    requireText(input.siteId, 'siteId');
    requireText(input.pageId, 'pageId');
    const found = await this.pages.findById(input.pageId);

    if (!found) {
      throw new PageNotFoundError('Page not found');
    }
    if (found.siteId !== input.siteId || found.pageId !== input.pageId) {
      throw new PageScopeError('Foreign page');
    }

    const saved = await this.archival.archive(found.toState(), await prepareCoreHook(this.hooks, input.siteId,
      input.pageId, 'cms.page.archive.check', { pageId: input.pageId }, 'cms.page.archived', 'system'));

    if (
      saved.pageId !== found.pageId
      || saved.siteId !== found.siteId
      || saved.mark !== found.mark
      || saved.status !== PageStatus.ARCHIVED
    ) {
      throw new PageScopeError('Invalid saved page');
    }

    return new Page(saved.toState());
  }
}
