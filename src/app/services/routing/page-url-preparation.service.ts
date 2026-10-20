import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import type { IAssignInitialPageUrlInput } from '../../../ports/inbound/routing/assign-initial-page-url.port.js';
import type { IPageLookupPort } from '../../../ports/outbound/routing/page-lookup.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { IUrlCreationValues } from '../../../ports/outbound/routing/url-creation-values.port.js';

export class PageUrlPreparationService {
  constructor(
    private readonly urls: IUrlRepository,
    private readonly pages: IPageLookupPort,
    private readonly creationValues: IUrlCreationValues,
  ) {}

  async prepare(input: IAssignInitialPageUrlInput): Promise<Url> {
    const at = this.creationValues.currentInstant();
    const url = new Url({
      urlId: this.creationValues.nextUrlId(),
      mark: input.mark,
      siteId: input.siteId,
      parentUrlId: input.parentUrlId,
      segment: input.segment,
      path: input.path,
      kind: UrlKind.PAGE,
      pageId: input.pageId,
      redirectTargetUrlId: null,
      redirectStatus: null,
      firstPublishedAt: at,
      createdAt: at,
      updatedAt: at,
    });
    const page = await this.pages.findPage(input.pageId);

    if (!page) {
      throw new RoutingNotFoundError('Page was not found');
    }
    if (page.siteId !== input.siteId) {
      throw new RoutingScopeError('Page belongs to another site');
    }
    if (input.parentUrlId !== null) {
      const parent = await this.urls.findById(input.parentUrlId);

      if (!parent) {
        throw new RoutingNotFoundError('Parent URL was not found');
      }
      if (parent.siteId !== input.siteId) {
        throw new RoutingScopeError('Parent URL belongs to another site');
      }
    }
    if (await this.urls.findByMark(url.mark)) {
      throw new RoutingConflictError('URL mark is already in use');
    }
    if (await this.urls.findByPath(url.siteId, url.path)) {
      throw new RoutingConflictError('URL path is already in use for this site');
    }

    return url;
  }
}
