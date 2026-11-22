import { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  IRestorePageVersion,
  IRestorePageVersionInput,
} from '../../../ports/inbound/pages/restore-page-version.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import type { IPageLifecycleValues } from '../../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { IPagePublicationPort } from '../../../ports/outbound/pages/page-publication.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class RestorePageVersionUseCase implements IRestorePageVersion {
  constructor(private readonly pages: IPageRepository, private readonly publications: IPagePublicationPort,
    private readonly access: IPageAccessPort, private readonly values: IPageLifecycleValues,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: IRestorePageVersionInput): Promise<Page> {
    await this.access.assertCanUpdatePage(input.siteId);
    requireCondition(Number.isInteger(input.version) && input.version >= 1 && input.version <= 3,
      'Invalid retained version position');
    const page = await this.pages.findById(input.pageId);

    if (!page) {
      throw new PageNotFoundError('Page not found');
    }
    if (page.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new PageScopeError('Foreign page');
    }

    const versions = await this.publications.versions(input.siteId, input.pageId);

    if (
      versions.length > 3
      || versions.some((version) =>
        version.siteId !== input.siteId || version.pageId !== input.pageId
      || version.status !== PageStatus.PUBLISHED || version.mark !== page.mark || version.language !== page.language)
    ) {
      throw new PageScopeError('Inconsistent retained publications');
    }

    const selected = versions[input.version - 1];

    if (!selected) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Retained version not found');
    }

    const draft = new Page(page.toState());

    draft.restorePublishedContent(selected);
    const saved = await this.publications.restore(page.toState(), selected, input.version,
      draft, this.values.currentInstant(), await prepareCoreHook(this.hooks, input.siteId, input.pageId,
        'cms.page.restore-version.check', { pageId: input.pageId, position: input.version },
        'cms.page.version.restored', 'system'));

    if (
      saved.siteId !== input.siteId
      || saved.pageId !== input.pageId
      || saved.status !== PageStatus.DRAFT
      || saved.mark !== page.mark
      || saved.language !== page.language
    ) {
      throw new PageScopeError('Invalid restored draft');
    }

    return new Page(saved.toState());
  }
}
