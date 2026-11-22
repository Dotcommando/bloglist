import { SystemDocument } from '../../../domain/pages/document-mime.js';
import { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { validatePageRendering } from '../../../domain/pages/page-rendering.policy.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { parseRequestCachePolicy } from '../../../domain/publication/request-cache.policy.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IUpdatePage, IUpdatePageInput } from '../../../ports/inbound/pages/update-page.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class UpdatePageUseCase implements IUpdatePage {
  constructor(private readonly pages: IPageRepository, private readonly access: IPageAccessPort,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: IUpdatePageInput): Promise<Page> {
    await this.access.assertCanUpdatePage(input.siteId);
    requireText(input.pageId, 'pageId');
    requireText(input.siteId, 'siteId');
    const found = await this.pages.findById(input.pageId, input.authority);

    if (!found) {
      throw new PageNotFoundError('Page not found');
    }
    if (found.siteId !== input.siteId || found.pageId !== input.pageId) {
      throw new PageScopeError('Page identity or site does not match');
    }

    requireCondition(found.systemDocument !== SystemDocument.Sitemap, 'sitemap.xml is generated and read-only');
    const page = new Page(found.toState());

    if (input.mimeType !== undefined || input.excludeFromSitemap !== undefined) {
      page.changeDocument(input.mimeType ?? page.mimeType,
        input.excludeFromSitemap ?? page.toState().excludeFromSitemap ?? false);
    }
    if (input.requestCache !== undefined) {
      const rendering = page.toState().rendering;

      requireCondition(rendering !== undefined, 'Page rendering is required for a cache policy');
      const next = { ...rendering! };

      delete next.requestCache;

      if (input.requestCache !== null) {
        next.requestCache = parseRequestCachePolicy(input.requestCache);
      }
      validatePageRendering(next);
      page.configureRendering(next);
    }
    if (input.sortOrder !== undefined) {
      page.changeSortOrder(input.sortOrder);
    }
    if (input.title !== undefined) {
      page.changeTitle(input.title);
    }
    if (input.h1 !== undefined) {
      page.changeHeading(input.h1);
    }
    if (input.metaTitle !== undefined || input.metaDescription !== undefined) {
      page.changeSeoMetadata({
        metaTitle: input.metaTitle === undefined ? page.metaTitle : input.metaTitle,
        metaDescription: input.metaDescription === undefined ? page.metaDescription : input.metaDescription,
      });
    }
    if (input.contentMd !== undefined) {
      page.changeContent(input.contentMd);
    }

    const social = Object.fromEntries(Object.entries({
      ogTitle: input.ogTitle,
      ogDescription: input.ogDescription,
      ogImage: input.ogImage,
      ogType: input.ogType,
    }).filter(([, value]) => value !== undefined));

    if (Object.keys(social).length) {
      page.changeOpenGraph(social);
    }
    if (input.type !== undefined) {
      page.changeType(input.type);
    }
    if (input.robotsIndex !== undefined) {
      page.setRobotsIndex(input.robotsIndex);
    }
    if (
      input.requestCache !== undefined
      || input.title !== undefined
      || input.h1 !== undefined
      || input.metaTitle !== undefined
      || input.metaDescription !== undefined
      || input.contentMd !== undefined
      || input.type !== undefined
      || input.robotsIndex !== undefined
      || input.mimeType !== undefined
      || input.excludeFromSitemap !== undefined
      || Object.keys(social).length
    ) {
      page.editDraft();
    }

    const saved = await this.pages.save(page, await prepareCoreHook(this.hooks, input.siteId, page.pageId,
      'cms.page.update.check', {
        pageId: page.pageId,
        changedFields: Object.keys(input).filter(key =>
          !['siteId', 'pageId', 'authority'].includes(key)),
      }, 'cms.page.draft.updated', 'system'), found.toState(),
    input.authority ? { authority: input.authority } : undefined);

    if (
      saved.pageId !== page.pageId
      || saved.siteId !== page.siteId
      || saved.mark !== page.mark
      || saved.language !== page.language
    ) {
      throw new PageScopeError('Inconsistent saved page identity');
    }

    return new Page(saved.toState());
  }
}
