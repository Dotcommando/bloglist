import {
  mediaReferenceOrigins, mediaReferenceRewriter,
} from '../../../domain/media/media-reference-rewrite.policy.js';
import { Page } from '../../../domain/pages/page.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IRewritePageMediaReferences,
} from '../../../ports/inbound/pages/rewrite-page-media-references.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class RewritePageMediaReferencesUseCase implements IRewritePageMediaReferences {
  constructor(private readonly pages: IPageRepository,
    private readonly access: Pick<IPageAccessPort, 'assertCanUpdatePage'>,
    private readonly sites: IGetSite, private readonly hooks: IHookChangesPort) {}

  async execute(input: Parameters<IRewritePageMediaReferences['execute']>[0]): Promise<void> {
    await this.access.assertCanUpdatePage(input.siteId);
    const site = await this.sites.execute({ siteId: input.siteId });
    const page = await this.pages.findById(input.pageId);

    if (site?.siteId !== input.siteId || page?.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Page or site not found');
    }

    const rewrite = mediaReferenceRewriter(input.paths, mediaReferenceOrigins(site.toState()));
    const previous = page.toState();
    const contentMd = rewrite.text(previous.contentMd);
    const ogImage = previous.ogImage == null ? null : rewrite.text(previous.ogImage);
    const rendering = previous.rendering ? {
      ...previous.rendering,
      parameters: rewrite.object(previous.rendering.parameters),
      loaders: previous.rendering.loaders.map((loader) => ({
        ...loader, parameters: rewrite.object(loader.parameters),
      })),
    } : undefined;

    if (
      contentMd === previous.contentMd
      && ogImage === previous.ogImage
      && JSON.stringify(rendering) === JSON.stringify(previous.rendering)
    ) {
      return;
    }

    const next = new Page({ ...previous, contentMd, ogImage, ...(rendering ? { rendering } : {}) });

    next.editDraft();
    const changedFields: string[] = [];

    if (contentMd !== previous.contentMd) {
      changedFields.push('contentMd');
    }
    if (ogImage !== previous.ogImage) {
      changedFields.push('ogImage');
    }
    if (JSON.stringify(rendering) !== JSON.stringify(previous.rendering)) {
      changedFields.push('rendering');
    }

    const saved = await this.pages.save(next, await prepareCoreHook(this.hooks, input.siteId, input.pageId,
      'cms.page.update.check', { pageId: input.pageId, changedFields },
      'cms.page.draft.updated', 'system'), previous);

    if (saved.siteId !== input.siteId || saved.pageId !== input.pageId) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Inconsistent saved page identity');
    }
  }
}
