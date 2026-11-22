import { DOCUMENT_MIME_TYPES, SystemDocument } from '../../../domain/pages/document-mime.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { HtmlDelivery } from '../../../domain/pages/page-rendering.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type { IPageAvailability } from '../../../domain/publication/page-availability.js';
import { PublishedRouteKind } from '../../../domain/publication/published-route.js';
import { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetPage } from '../../../ports/inbound/pages/get-page.port.js';
import type { IGetPageEditorialStates } from '../../../ports/inbound/pages/get-page-editorial-states.port.js';
import type {
  IGetPublicationOptions, IGetPublicationOptionsInput, IPublicationOptions,
} from '../../../ports/inbound/publication/get-publication-options.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IPublishedRoutingPort } from '../../../ports/outbound/publication/published-routing.port.js';
import type { IRenderingSourcePort } from '../../../ports/outbound/publication/rendering-source.port.js';
import type { IRoutingSourcePort } from '../../../ports/outbound/routing/routing-source.port.js';

export class GetPublicationOptionsUseCase implements IGetPublicationOptions {
  constructor(private readonly sites: IGetSite, private readonly pages: IGetPage,
    private readonly sources: IRenderingSourcePort, private readonly routing: IRoutingSourcePort,
    private readonly published: IPublishedRoutingPort, private readonly editorial: IGetPageEditorialStates) {}

  async execute(input: IGetPublicationOptionsInput): Promise<IPublicationOptions> {
    const site = await this.sites.execute({ siteId: input.siteId });

    if (site?.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    const page = input.pageId ? await this.pages.execute({ siteId: input.siteId, pageId: input.pageId }) : null;

    if (input.pageId && !page) {
      throw new PageNotFoundError('Page not found');
    }
    if (page && (page.siteId !== input.siteId || page.pageId !== input.pageId)) {
      throw new PageScopeError('Foreign page');
    }

    const sources = await this.sources.read(input.siteId);
    const urls = await this.routing.readUrls(input.siteId);

    if (urls.some((url) => url.siteId !== input.siteId)) {
      throw new PageScopeError('Foreign page routing');
    }

    const availability = new Map<string, IPageAvailability>();

    if (page) {
      availability.set(page.pageId, { pageId: page.pageId, assignedPath: null, publicPath: null });
    }

    for (const url of urls) {
      if (url.kind === UrlKind.PAGE && url.pageId && (!input.pageId || url.pageId === input.pageId)) {
        availability.set(url.pageId, { pageId: url.pageId, assignedPath: url.path, publicPath: null });
      }
    }
    const active = await this.published.readActive(input.siteId);

    for (const route of active?.routes ?? []) {
      if (route.kind !== PublishedRouteKind.Redirect && (!input.pageId || route.pageId === input.pageId)) {
        const current = availability.get(route.pageId);

        availability.set(route.pageId, {
          pageId: route.pageId, assignedPath: current?.assignedPath ?? null, publicPath: route.path,
        });
      }
    }

    const editorial = await this.editorial.execute(input);

    if (editorial.releaseId !== (active?.releaseId ?? null)) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Publication changed while reading editor state');
    }

    return {
      editorial,
      requestDelivery: page?.toState().rendering?.delivery === HtmlDelivery.Request,
      requestCache: page?.toState().rendering?.requestCache ?? null,
      mimeTypes: DOCUMENT_MIME_TYPES,
      crawlerDiagnostics: active?.crawlerDiagnostics
        ?.filter((item) => !input.pageId || item.pageId === input.pageId) ?? [],
      generatedContent: page?.systemDocument === SystemDocument.Sitemap ? active?.sitemapContent ?? null : null,
      pageAvailability: [...availability.values()],
      templates: sources.templates.filter((template) => template.kind === TemplateSourceKind.Template)
        .map((template) => ({
          templateId: template.id,
          name: template.name ?? template.id,
          requiresParameters: template.parameters.some((field) => field.required && field.defaultValue === undefined),
        })),
      templateId: page?.toState().rendering?.templateId ?? null,
      path: urls.find((url) => url.kind === UrlKind.PAGE && url.pageId === input.pageId)?.path ?? null,
    };
  }
}
