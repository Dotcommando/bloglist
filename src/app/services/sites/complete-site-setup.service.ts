import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import {
  SystemDocument, systemDocumentMark, systemDocumentMime, systemDocumentPath,
} from '../../../domain/pages/document-mime.js';
import { Page } from '../../../domain/pages/page.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { PageType } from '../../../domain/pages/page-type.enum.js';
import { PublicationRelease, ReleaseState } from '../../../domain/publication/publication-release.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { Site } from '../../../domain/sites/site.js';
import { servingSiteOrigin } from '../../../domain/sites/site-addresses.js';
import type { IFrontendBuildPort } from '../../../ports/outbound/publication/frontend-build.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type {
  ISiteDocumentSeed, ISiteDocumentsPort, ISiteDocumentValues,
} from '../../../ports/outbound/sites/site-documents.port.js';
import type { ISiteSetupPort } from '../../../ports/outbound/sites/site-setup.port.js';

/** Completes the same site setup in local, HTTP and system-object composition. */
export class CompleteSiteSetupService implements ISiteSetupPort {
  constructor(private readonly completion: ISiteSetupPort, private readonly documents: ISiteDocumentsPort,
    private readonly frontend: IFrontendBuildPort, private readonly store: IPublicationStorePort,
    private readonly activation: IReleaseActivationPort, private readonly values: ISiteDocumentValues) {}

  async complete(previous: Site, next: Site, intent: IHookCommitIntent): Promise<Site> {
    const origin = servingSiteOrigin(previous.toState().addresses) ?? undefined;
    const at = this.values.now();
    const seeds = Object.values(SystemDocument).map((role, index): ISiteDocumentSeed => {
      const pageId = this.values.nextPageId();
      const path = systemDocumentPath(role);
      const contentMd = role === SystemDocument.Sitemap
        ? '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'
        : role === SystemDocument.Robots
          ? 'User-agent: *\nDisallow: /admin$\nDisallow: /admin/\nDisallow: /api/admin$\nDisallow: /api/admin/\n'
            + (origin ? '\nSitemap: ' + origin + '/sitemap.xml\n' : '')
          : '';
      const page = new Page({
        pageId,
        siteId: previous.siteId,
        mark: systemDocumentMark(role),
        pageNumber: String(index + 1),
        parentPageId: null,
        sortOrder: (index + 1) * 100,
        language: previous.toState().defaultLanguage,
        clusterId: null,
        type: PageType.STATIC,
        status: PageStatus.PUBLISHED,
        title: path.slice(1),
        h1: null,
        metaTitle: null,
        metaDescription: null,
        contentMd,
        mimeType: systemDocumentMime(role),
        systemDocument: role,
        excludeFromSitemap: true,
        robotsIndex: false,
        publishedAt: at,
        createdAt: at,
        updatedAt: at,
      });

      return {
        page: page.toState(),
        url: {
          urlId: this.values.nextUrlId(),
          mark: 'Address' + pageId.replace(/[^a-z0-9]/gi, ''),
          siteId: previous.siteId,
          parentUrlId: null,
          segment: path.slice(1),
          path,
          kind: UrlKind.PAGE,
          pageId,
          redirectTargetUrlId: null,
          redirectStatus: null,
          firstPublishedAt: at,
          createdAt: at,
          updatedAt: at,
        },
      };
    });
    const saved = await this.documents.ensure(previous.siteId, seeds);

    requireCondition(saved.length === 3 && new Set(saved.map((seed) => seed.page.systemDocument)).size === 3
      && saved.every((seed) => seed.page.siteId === previous.siteId && seed.url.siteId === previous.siteId
        && seed.url.pageId === seed.page.pageId && seed.page.systemDocument
        && seed.url.path === systemDocumentPath(seed.page.systemDocument)), 'Incomplete or foreign site documents');
    const releaseId = 'initial-' + previous.siteId;
    let receipt = await this.activation.findActivation(previous.siteId, releaseId);

    if (!receipt) {
      const active = await this.activation.getActive(previous.siteId);

      requireCondition(active === null, 'Initial setup cannot replace an existing release');
      const existing = await this.store.read(previous.siteId, releaseId);

      if (!existing) {
        const built = await this.frontend.build({
          releaseId,
          snapshot: {
            siteId: previous.siteId,
            siteKey: 'Initial',
            ...(origin ? { publicOrigin: origin } : {}),
            settings: {},
            requestParameters: [],
            templates: [],
            frontendSources: [],
            pages: saved.map((seed) => seed.page),
            urls: saved.map((seed) => seed.url),
          },
          documents: saved.map((seed) => ({
            pageId: seed.page.pageId, html: seed.page.contentMd, frontendSourceIds: [],
          })),
          requestPlans: [],
        });
        const release = new PublicationRelease({
          releaseId,
          siteId: previous.siteId,
          state: ReleaseState.Staged,
          manifest: null,
          failure: null,
          createdAt: at,
          completedAt: null,
        });

        release.complete(built.manifest, this.values.now());
        await this.store.stage(release.toState(), built.artifacts);
      } else {
        requireCondition(existing.siteId === previous.siteId && existing.state === ReleaseState.Ready,
          'Initial release is incomplete');
      }

      try {
        receipt = await this.activation.activate({
          siteId: previous.siteId, releaseId, expectedActiveReleaseId: null, activatedAt: this.values.now(),
        });
      } catch (error) {
        receipt = await this.activation.findActivation(previous.siteId, releaseId);

        if (!receipt) {
          throw error;
        }
      }
    }
    requireCondition(receipt.siteId === previous.siteId && receipt.releaseId === releaseId,
      'Foreign initial activation');

    return this.completion.complete(previous, next, intent);
  }
}
