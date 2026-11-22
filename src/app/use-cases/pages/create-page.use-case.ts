import { authorizeContentCreation } from '../../../domain/authorization/content-access.js';
import { Page } from '../../../domain/pages/page.js';
import { PageConflictError } from '../../../domain/pages/page-conflict.error.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { assertPageParent } from '../../../domain/pages/page-tree.policy.js';
import { PageType } from '../../../domain/pages/page-type.enum.js';
import { AutomaticPageUrlError, AutomaticPageUrlIssue } from '../../../domain/routing/automatic-page-url.error.js';
import { routingHookFacts } from '../../../domain/routing/routing-hook-facts.policy.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { ICreatePage, ICreatePageInput } from '../../../ports/inbound/pages/create-page.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';
import type { IPageSaveAccess, IPrepareAutomaticPageUrl } from '../../../ports/outbound/pages/page-creation.port.js';
import type { IPageLifecycleValues } from '../../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { ISiteLookupPort } from '../../../ports/outbound/pages/site-lookup.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class CreatePageUseCase implements ICreatePage {
  constructor(private readonly repository: IPageRepository, private readonly sites: ISiteLookupPort,
    private readonly values: IPageLifecycleValues, private readonly access: IPageAccessPort, private readonly hooks:
    IHookChangesPort, private readonly automaticUrls?: IPrepareAutomaticPageUrl,
  ) {}

  async execute(input: ICreatePageInput): Promise<Page> {
    await this.access.assertCanCreatePage(input.siteId);
    authorizeContentCreation(input.siteId, input);

    if (input.authority?.automaticPageUrl && !input.h1?.trim()) {
      throw new AutomaticPageUrlError(AutomaticPageUrlIssue.Heading);
    }
    requireCondition(input.clusterId === undefined || input.clusterId === null,
      'Cluster assignment is unsupported without its owning extension');
    const instant = this.values.currentInstant();
    const page = new Page({
      pageId: this.values.nextPageId(),
      parentPageId: input.parentPageId ?? null,
      sortOrder: input.sortOrder ?? null,
      siteId: input.siteId,
      mark: input.mark,
      language: input.language,
      title: input.title,
      clusterId: null,
      type: input.type ?? PageType.STATIC,
      status: PageStatus.DRAFT,
      h1: input.h1 ?? null,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      ogTitle: input.ogTitle ?? null,
      ogDescription: input.ogDescription ?? null,
      ogImage: input.ogImage ?? null,
      ogType: input.ogType ?? null,
      contentMd: input.contentMd ?? '',
      mimeType: input.mimeType ?? 'text/html',
      excludeFromSitemap: input.excludeFromSitemap ?? false,
      robotsIndex: input.robotsIndex ?? true,
      publishedAt: null,
      createdAt: instant,
      updatedAt: instant,
    });
    const site = await this.sites.findSite(page.siteId);

    if (!site) {
      throw new PageNotFoundError('Site not found');
    }
    if (site.siteId !== page.siteId || !site.languages.includes(page.language)) {
      throw new PageScopeError('Site identity or page language is not permitted');
    }
    if (await this.repository.findByMark(page.siteId, page.mark)) {
      throw new PageConflictError('Page mark already exists');
    }
    if (page.parentPageId !== null) {
      assertPageParent(page.siteId, page.pageId, page.parentPageId,
        (await this.repository.findBySite(page.siteId, undefined, input.authority)).map((item) => item.toState()));
    }

    const pageHook = await prepareCoreHook(this.hooks, input.siteId,
      page.pageId, 'cms.page.create.check', {
        pageId: page.pageId,
        title: page.title,
        language: page.language,
      }, 'cms.page.created', 'system');
    let access: IPageSaveAccess = input;

    if (input.authority?.automaticPageUrl) {
      if (!this.automaticUrls) {
        throw new Error('Automatic page URL preparation is unavailable');
      }

      const url = await this.automaticUrls.prepare(page, site.transliteration ?? [],
        site.collapseTransliterationHyphens ?? true);
      const hookChange = await this.hooks.prepare({
        siteId: page.siteId,
        actorId: input.authority.actorId,
        subject: 'routing:' + page.siteId,
        checkKey: 'cms.routing.change.check',
        candidate: { urlId: url.urlId, pageId: page.pageId, path: url.path, kind: url.kind },
        facts: routingHookFacts([], [url.toState()]),
      });

      access = { ...input, initialUrl: { url, hookChange } };
    }

    const saved = await this.repository.save(page, pageHook, undefined, access);

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
