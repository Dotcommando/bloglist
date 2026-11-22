import type { IActivePublication } from '../../../../domain/publication/publication-release.js';
import type { IChangePageUrlInput } from '../../../../ports/inbound/routing/change-page-url.port.js';
import type { IChangedPublishedPageUrl } from '../../../../ports/inbound/routing/change-published-page-url.port.js';
import type { IGetUrlCatalog } from '../../../../ports/inbound/routing/get-url-catalog.port.js';
import type { IGetUrlHistory } from '../../../../ports/inbound/routing/get-url-history.port.js';
import type {
  IMaterializedVirtualUrl, IMaterializeVirtualUrlCommand,
} from '../../../../ports/inbound/routing/materialize-virtual-url.port.js';
import type { IRedirectedPublishedUrl } from '../../../../ports/inbound/routing/redirect-published-url.port.js';
import type { IRedirectUrlInput } from '../../../../ports/inbound/routing/redirect-url.port.js';
import type { ISearchUrls } from '../../../../ports/inbound/routing/search-urls.port.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type { IUpdateSite } from '../../../../ports/inbound/sites/update-site.port.js';

export interface IAdminRoutingOperations {
  readonly materialize: { execute(input: IMaterializeVirtualUrlCommand): Promise<IMaterializedVirtualUrl> };
  readonly catalog: IGetUrlCatalog;
  readonly search: ISearchUrls;
  readonly history: IGetUrlHistory;
  readonly change: { execute(input: IChangePageUrlInput): Promise<IChangedPublishedPageUrl> };
  readonly publishRouting: { execute(siteId: string): Promise<IActivePublication | null> };
  readonly redirect: { execute(input: Omit<IRedirectUrlInput, 'actorId'>): Promise<IRedirectedPublishedUrl> };
  readonly getSite: IGetSite;
  readonly updateSite: IUpdateSite;
}

export interface IAdminRoutingOperationFactory {
  forSession(token: string | null): IAdminRoutingOperations;
}
