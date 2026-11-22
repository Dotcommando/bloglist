import { validateJsonLdCatalog } from '../../../domain/json-ld/json-ld-catalog.js';
import { jsonLdRoutes } from '../../../domain/json-ld/json-ld-routes.js';
import { PublishedRouteKind } from '../../../domain/publication/published-route.js';
import type { IPublicationSnapshot } from '../../../domain/publication/render-plan.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IJsonLdCatalogReader } from '../../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { IPublishedRoutingPort } from '../../../ports/outbound/publication/published-routing.port.js';

export class JsonLdPublicationSourceService implements IPublicationSourcePort {
  constructor(private readonly source: IPublicationSourcePort, private readonly catalogs: IJsonLdCatalogReader,
    private readonly published: IPublishedRoutingPort) {}

  async capture(siteId: string, previewPageId?: string): Promise<IPublicationSnapshot> {
    const snapshot = await this.source.capture(siteId, previewPageId);
    const catalog = await this.catalogs.read(siteId);

    if (catalog.siteId !== siteId || snapshot.siteId !== siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign JSON-LD catalog or source');
    }
    validateJsonLdCatalog(catalog);

    if (!snapshot.publicOrigin) {
      if (
        catalog.profiles.some((profile) => snapshot.pages.some((page) =>
          page.rendering && profile.templateIds.includes(page.rendering.templateId)))
      ) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Configure the public origin for JSON-LD');
      }

      return snapshot;
    }

    const active = previewPageId ? await this.published.readActive(siteId) : null;
    const routes = previewPageId ? jsonLdRoutes((active?.routes ?? []).map((route) => ({
      urlId: route.urlId,
      path: route.path,
      pageId: route.kind === PublishedRouteKind.Redirect ? null : route.pageId,
      targetUrlId: route.kind === PublishedRouteKind.Redirect ? route.targetUrlId : null,
    }))) : jsonLdRoutes(snapshot.urls.map((url) => ({
      urlId: url.urlId,
      path: url.path,
      pageId: url.pageId && snapshot.pages.some((page) => page.pageId === url.pageId) ? url.pageId : null,
      targetUrlId: url.redirectTargetUrlId,
    })));
    const bindingsSource = previewPageId ? await this.source.capture(siteId) : snapshot;

    return {
      ...snapshot,
      jsonLd: {
        catalog: structuredClone(catalog),
        origin: snapshot.publicOrigin,
        routes,
        bindings: bindingsSource.pages.flatMap((page) => page.rendering ? [{
          pageId: page.pageId, templateId: page.rendering.templateId,
        }] : []),
      },
    };
  }
}
