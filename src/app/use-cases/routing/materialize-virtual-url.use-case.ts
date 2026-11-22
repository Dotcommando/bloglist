import { routingHookFacts } from '../../../domain/routing/routing-hook-facts.policy.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { requireUrlPath } from '../../../domain/routing/url-path.policy.js';
import { virtualUrlChildren } from '../../../domain/routing/virtual-url.policy.js';
import type { IPublishRoutingRelease } from '../../../ports/inbound/publication/publish-routing-release.port.js';
import type {
  IMaterializedVirtualUrl, IMaterializeVirtualUrl, IMaterializeVirtualUrlInput,
} from '../../../ports/inbound/routing/materialize-virtual-url.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IUrlCreationValues } from '../../../ports/outbound/routing/url-creation-values.port.js';
import type { IVirtualUrlStore } from '../../../ports/outbound/routing/virtual-url-store.port.js';

export class MaterializeVirtualUrlUseCase implements IMaterializeVirtualUrl {
  constructor(private readonly store: IVirtualUrlStore, private readonly access: IPublicationAccessPort,
    private readonly values: IUrlCreationValues, private readonly publish: IPublishRoutingRelease,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: IMaterializeVirtualUrlInput): Promise<IMaterializedVirtualUrl> {
    await this.access.assertEditor(input.siteId, input.actorId);
    requireUrlPath(input.path);

    if (input.path.length > 2048 || /^\/(?:(?:api|admin|assets)(?:\/|$)|favicon\.ico$)/.test(input.path)) {
      throw new RangeError('Reserved or excessive URL path');
    }

    const path = input.path.endsWith('/') ? input.path : input.path + '/';
    const snapshot = await this.store.read(input.siteId);

    if (
      snapshot.siteId !== input.siteId
      || snapshot.urls.some((url) => url.siteId !== input.siteId)
      || snapshot.pages.some((page) => page.siteId !== input.siteId)
    ) {
      throw new RoutingScopeError('Foreign virtual folder state');
    }

    const existing = snapshot.urls.find((url) => url.path === path && url.kind === UrlKind.PAGE
      && input.kind === UrlKind.PAGE && url.pageId === input.pageId);

    if (existing) {
      return { url: new Url(existing), publication: null, publicationFailed: false };
    }

    const at = this.values.currentInstant();
    const url = new Url({
      urlId: this.values.nextUrlId(),
      mark: this.values.nextUrlMark(),
      siteId: input.siteId,
      parentUrlId: null,
      segment: path.split('/').filter(Boolean).at(-1) ?? '/',
      path,
      kind: input.kind,
      pageId: input.kind === UrlKind.PAGE ? input.pageId : null,
      redirectTargetUrlId: input.kind === UrlKind.REDIRECT ? input.targetUrlId : null,
      redirectStatus: input.kind === UrlKind.REDIRECT ? input.redirectStatus : null,
      firstPublishedAt: at,
      createdAt: at,
      updatedAt: at,
    });
    const children = virtualUrlChildren(snapshot, url.toState());
    const intent = await this.hooks.prepare({
      siteId: input.siteId,
      actorId: input.actorId,
      subject: 'routing:' + input.siteId,
      checkKey: 'cms.routing.change.check',
      candidate: { urlId: url.urlId, path, kind: url.kind, childPageIds: children },
      facts: routingHookFacts(snapshot.urls, [...snapshot.urls, url.toState()]),
    });

    await this.store.commit(snapshot, url, children, intent);

    if (input.kind === UrlKind.PAGE) {
      return { url, publication: null, publicationFailed: false };
    }

    try {
      return {
        url,
        publication: await this.publish.execute({ siteId: input.siteId, actorId: input.actorId }),
        publicationFailed: false,
      };
    } catch {
      return { url, publication: null, publicationFailed: true };
    }
  }
}
