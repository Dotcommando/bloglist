import { SystemDocument } from '../../../domain/pages/document-mime.js';
import { changedPageFields } from '../../../domain/pages/page-editorial.policy.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IGetPageEditorialStates } from '../../../ports/inbound/pages/get-page-editorial-states.port.js';
import type { ICmsPublishedPagesPort } from '../../../ports/outbound/cms/published-pages.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';

export class GetPageEditorialStatesUseCase implements IGetPageEditorialStates {
  constructor(private readonly access: Pick<IPageAccessPort, 'assertCanReadPage'>,
    private readonly pages: Pick<IPageRepository, 'findBySite'>,
    private readonly activation: Pick<IReleaseActivationPort, 'getActive'>,
    private readonly publications: Pick<ICmsPublishedPagesPort, 'readRelease'>) {}

  async execute(input: Parameters<IGetPageEditorialStates['execute']>[0]):
  ReturnType<IGetPageEditorialStates['execute']> {
    await this.access.assertCanReadPage(input.siteId);
    requireText(input.siteId, 'siteId');
    const drafts = await this.pages.findBySite(input.siteId, {});
    const active = await this.activation.getActive(input.siteId);

    if (drafts.some((page) => page.siteId !== input.siteId) || active && active.siteId !== input.siteId) {
      throw new PageScopeError('Foreign editorial state');
    }

    const states = await Promise.all(drafts.filter((page) => !input.pageId || page.pageId === input.pageId
      || page.systemDocument === SystemDocument.Robots).map(async (page) => {
      const published = active
        ? await this.publications.readRelease(input.siteId, page.pageId, active.releaseId) : null;

      if (published && (published.siteId !== input.siteId || published.pageId !== page.pageId)) {
        throw new PageScopeError('Foreign published page');
      }

      return { page, published, changedFields: published ? changedPageFields(page.toState(), published) : [] };
    }));

    return {
      releaseId: active?.releaseId ?? null,
      pages: states.filter(({ page }) => !input.pageId || page.pageId === input.pageId).map((state) => ({
        pageId: state.page.pageId, hasPublishedVersion: state.published !== null, changedFields: state.changedFields,
      })),
      publishedPage: states.find(({ page }) => page.pageId === input.pageId)?.published ?? null,
      robotsHasUnpublishedChanges: states.some(({ page, changedFields }) =>
        page.systemDocument === SystemDocument.Robots && changedFields.length > 0),
    };
  }
}
