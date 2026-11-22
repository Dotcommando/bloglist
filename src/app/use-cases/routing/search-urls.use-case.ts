import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { UrlSearchPurpose } from '../../../domain/routing/url-search.js';
import type {
  ISearchUrls, ISearchUrlsInput, IUrlSuggestions,
} from '../../../ports/inbound/routing/search-urls.port.js';
import type { IRoutingAccessPort } from '../../../ports/outbound/routing/routing-access.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { IUrlSearchPort } from '../../../ports/outbound/routing/url-search.port.js';

export class SearchUrlsUseCase implements ISearchUrls {
  constructor(private readonly access: Pick<IRoutingAccessPort, 'assertCanReadRouting'>,
    private readonly urls: Pick<IUrlRepository, 'findById'>, private readonly search: IUrlSearchPort) {}

  async execute(input: ISearchUrlsInput): Promise<IUrlSuggestions> {
    await this.access.assertCanReadRouting(input.siteId);

    if (
      !Number.isSafeInteger(input.limit)
      || input.limit < 1
      || input.limit > 10
      || !Number.isSafeInteger(input.offset)
      || input.offset < 0
      || input.query.length > 2048
      || !Object.values(UrlSearchPurpose).includes(input.purpose)
    ) {
      throw new RangeError('Invalid URL search');
    }

    const current = input.currentUrlId ? await this.urls.findById(input.currentUrlId) : null;

    if (!current && (input.currentUrlId || input.purpose !== UrlSearchPurpose.Redirect)) {
      throw new RoutingNotFoundError('URL not found');
    }
    if (current && current.siteId !== input.siteId) {
      throw new RoutingScopeError('Foreign URL');
    }

    const items = await this.search.search({
      siteId: input.siteId,
      query: input.query,
      limit: input.limit,
      offset: input.offset,
      excludeUrlId: current?.urlId ?? '',
      ...(input.purpose === UrlSearchPurpose.Parent && current ? {
        excludePathPrefix: current.path.endsWith('/') ? current.path : current.path + '/',
      } : {}),
      pagesOnly: input.purpose === UrlSearchPurpose.Redirect,
    });

    if (items.some((item) => item.siteId !== input.siteId)) {
      throw new RoutingScopeError('Foreign URL suggestion');
    }

    return { siteId: input.siteId, items };
  }
}
