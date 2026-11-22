import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import type { IListPages } from '../../../ports/inbound/pages/list-pages.port.js';
import type { IGetUrlCatalog, IUrlCatalog } from '../../../ports/inbound/routing/get-url-catalog.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IPublishedRoutingPort } from '../../../ports/outbound/publication/published-routing.port.js';
import type { IRoutingAccessPort } from '../../../ports/outbound/routing/routing-access.port.js';
import type { IRoutingSourcePort } from '../../../ports/outbound/routing/routing-source.port.js';
import type { IUrlBehaviorStorePort } from '../../../ports/outbound/routing/url-behavior-store.port.js';

export class GetUrlCatalogUseCase implements IGetUrlCatalog {
  constructor(private readonly access: Pick<IRoutingAccessPort, 'assertCanReadRouting'>,
    private readonly sites: IGetSite, private readonly pages: IListPages,
    private readonly routing: IRoutingSourcePort,
    private readonly versions: Pick<IUrlBehaviorStorePort, 'findVersionedUrl'>,
    private readonly published: IPublishedRoutingPort) {}

  async execute(input: { siteId: string }): Promise<IUrlCatalog> {
    const { siteId } = input;

    await this.access.assertCanReadRouting(siteId);
    const site = await this.sites.execute({ siteId });

    if (!site) {
      throw new RoutingNotFoundError('Site not found');
    }

    const urls = await this.routing.readUrls(siteId);
    const pages = await this.pages.execute({ siteId });

    if (
      site.siteId !== siteId
      || urls.some((url) => url.siteId !== siteId)
      || pages.some((page) => page.siteId !== siteId)
    ) {
      throw new RoutingScopeError('Foreign catalog source');
    }

    const versioned = [];

    for (const url of urls) {
      const current = await this.versions.findVersionedUrl(siteId, url.urlId);

      if (!current) {
        throw new RoutingConflictError('URL disappeared while loading the catalog');
      }
      if (current.url.siteId !== siteId || current.url.urlId !== url.urlId) {
        throw new RoutingScopeError('Foreign versioned URL');
      }
      versioned.push(current);
    }

    return {
      siteId,
      urls: versioned.sort((a, b) => a.url.path.localeCompare(b.url.path)),
      pages: pages.map((page) => ({
        pageId: page.pageId,
        title: page.title,
        language: page.language,
        status: page.status,
        robotsIndex: page.toState().robotsIndex ?? true,
      })),
      published: await this.published.readActive(siteId),
    };
  }
}
