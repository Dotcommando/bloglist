import { isSystemDocumentPath } from '../../../domain/pages/document-mime.js';
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
  constructor(private readonly urls: IUrlRepository, private readonly pages: IPageLookupPort,
    private readonly values: IUrlCreationValues) {}

  async prepare(input: IAssignInitialPageUrlInput): Promise<Url> {
    if (isSystemDocumentPath(input.path)) {
      throw new RoutingConflictError('System document URLs are reserved');
    }

    const at = this.values.currentInstant();
    const url = new Url({
      urlId: this.values.nextUrlId(),
      mark: input.mark,
      siteId: input.siteId,
      pageId: input.pageId,
      parentUrlId: input.parentUrlId,
      segment: input.segment,
      path: input.path,
      kind: UrlKind.PAGE,
      redirectTargetUrlId: null,
      redirectStatus: null,
      createdAt: at,
      updatedAt: at,
      firstPublishedAt: at,
    });
    const page = await this.pages.findPage(input.siteId, input.pageId);

    if (!page) {
      throw new RoutingNotFoundError('Page not found');
    }
    if (page.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new RoutingScopeError('Page identity or site does not match');
    }
    if (input.parentUrlId !== null) {
      const parent = await this.urls.findById(input.parentUrlId);

      if (!parent) {
        throw new RoutingNotFoundError('Parent URL not found');
      }
      if (parent.urlId !== input.parentUrlId || parent.siteId !== input.siteId) {
        throw new RoutingScopeError('Parent URL identity or site does not match');
      }
    }
    if (await this.urls.findByMark(url.mark) || await this.urls.findByPath(url.siteId, url.path)) {
      throw new RoutingConflictError('URL mark or path already exists');
    }

    return url;
  }
}
