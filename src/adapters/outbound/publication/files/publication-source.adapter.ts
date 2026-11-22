import { summarizePublishedPages } from '../../../../domain/publication/published-page-summary.js';
import type { IPublicationSnapshot } from '../../../../domain/publication/render-plan.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { servingSiteOrigin } from '../../../../domain/sites/site-addresses.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type { ISiteFaviconStore } from '../../../../ports/outbound/media/site-favicon-store.port.js';
import type { IPageContentSourcePort } from '../../../../ports/outbound/pages/page-content-source.port.js';
import type { IPublicationSourcePort } from '../../../../ports/outbound/publication/publication-source.port.js';
import type { IRenderingSourcePort } from '../../../../ports/outbound/publication/rendering-source.port.js';
import type { IRoutingSourcePort } from '../../../../ports/outbound/routing/routing-source.port.js';

export class PublicationSourceAdapter implements IPublicationSourcePort {
  constructor(private readonly sources: IRenderingSourcePort, private readonly pages: IPageContentSourcePort,
    private readonly routing: IRoutingSourcePort, private readonly sites: IGetSite,
    private readonly favicons?: Pick<ISiteFaviconStore, 'read'>) {}

  async capture(siteId: string, previewPageId?: string): Promise<IPublicationSnapshot> {
    const site = await this.sites.execute({ siteId });

    requireCondition(site !== null && site.siteId === siteId, 'Missing or foreign site');
    const sources = await this.sources.read(siteId);
    const pages = previewPageId === undefined ? await this.pages.readPublished(siteId)
      : [await this.pages.readWorking(siteId, previewPageId)];

    requireCondition(pages.every((page) => page !== null && page.siteId === siteId
      && (!previewPageId || page.pageId === previewPageId)), 'Missing or foreign page source');
    const urls = previewPageId === undefined ? await this.routing.readUrls(siteId) : [];

    requireCondition(urls.every((url) => url.siteId === siteId), 'Foreign URL source');

    const publishedPages = previewPageId === undefined ? undefined : summarizePublishedPages(siteId,
      await this.pages.readPublished(siteId), await this.routing.readUrls(siteId));
    const publicOrigin = servingSiteOrigin(site!.toState().addresses);
    const icon = await this.favicons?.read(siteId);
    let favicon: IPublicationSnapshot['favicon'] = null;

    try {
      favicon = icon ? {
        byteSize: icon.byteSize,
        width: icon.width,
        height: icon.height,
        version: icon.version,
      } : null;
    } finally {
      await icon?.dispose();
    }

    return {
      ...sources,
      ...(this.favicons ? { favicon } : {}),
      ...(publicOrigin ? { publicOrigin } : {}),
      siteId,
      pages: pages.filter((page) => page !== null),
      urls,
      ...(publishedPages === undefined ? {} : { publishedPages }),
    };
  }
}
