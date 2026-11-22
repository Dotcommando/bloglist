import { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { assertPageParent, validateSortOrder } from '../../../domain/pages/page-tree.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IMovePage, IMovePageInput } from '../../../ports/inbound/pages/move-page.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import type { IPageTreeStore } from '../../../ports/outbound/pages/page-tree-store.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class MovePageUseCase implements IMovePage {
  constructor(private readonly pages: IPageRepository, private readonly access: IPageAccessPort,
    private readonly store: IPageTreeStore, private readonly hooks: IHookChangesPort) {}

  async execute(input: IMovePageInput): Promise<Page> {
    await this.access.assertCanUpdatePage(input.siteId);
    requireText(input.siteId, 'siteId');
    requireText(input.pageId, 'pageId');
    validateSortOrder(input.expectedSortOrder);

    if (input.parentPageId !== null) {
      requireText(input.parentPageId, 'parentPageId');
    }

    const page = await this.pages.findById(input.pageId);

    if (!page) {
      throw new PageNotFoundError('Page not found');
    }
    if (page.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new PageScopeError('Foreign page');
    }
    if (page.systemDocument) {
      throw new BusinessError(BusinessErrorCode.Validation, 'System documents stay at the site root');
    }

    const expected = page.toState();

    if (
      (expected.parentPageId ?? null) !== input.expectedParentPageId
      || expected.sortOrder !== input.expectedSortOrder
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Page position changed');
    }

    const pages = await this.pages.findBySite(input.siteId);

    assertPageParent(input.siteId, input.pageId, input.parentPageId, pages.map((page) => page.toState()));
    const result = await this.store.move(expected, input.parentPageId, await prepareCoreHook(this.hooks,
      input.siteId, input.pageId, 'cms.page.move.check', {
        pageId: input.pageId,
        parentPageId:
      input.parentPageId,
      }, 'cms.page.moved', 'system'));
    const saved = result.toState();

    if (
      saved.pageId !== expected.pageId
      || saved.siteId !== expected.siteId
      || saved.pageNumber !== expected.pageNumber
      || saved.sortOrder !== expected.sortOrder
      || saved.parentPageId !== input.parentPageId
    ) {
      throw new PageScopeError('Inconsistent moved page');
    }

    return new Page(saved);
  }
}
