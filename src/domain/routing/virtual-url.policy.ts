import type { IPageState } from '../pages/page.js';
import { assertPageParent } from '../pages/page-tree.policy.js';
import { RoutingConflictError } from './routing-conflict.error.js';
import { RoutingScopeError } from './routing-scope.error.js';
import type { IUrlState } from './url.js';
import { UrlKind } from './url-kind.enum.js';

export interface IVirtualUrlSnapshot {
  readonly siteId: string;
  readonly urls: readonly IUrlState[];
  readonly pages: readonly IPageState[];
}

export function virtualUrlChildren(snapshot: IVirtualUrlSnapshot, next: IUrlState): readonly string[] {
  if (
    snapshot.siteId !== next.siteId
    || snapshot.urls.some((url) => url.siteId !== next.siteId)
    || snapshot.pages.some((page) => page.siteId !== next.siteId)
  ) {
    throw new RoutingScopeError('Foreign virtual folder state');
  }

  const prefix = next.path.endsWith('/') ? next.path : next.path + '/';

  if (
    next.path !== prefix
    || snapshot.urls.some((url) => url.path === next.path
    || url.path === prefix.slice(0, -1))
    || !snapshot.urls.some((url) => url.path.startsWith(prefix))
  ) {
    throw new RoutingConflictError('The path is no longer a virtual folder');
  }
  if (next.kind === UrlKind.REDIRECT) {
    if (!snapshot.urls.some((url) => url.urlId === next.redirectTargetUrlId && url.kind === UrlKind.PAGE)) {
      throw new RoutingConflictError('Redirect destination must be an existing page URL');
    }

    return [];
  }
  if (
    !snapshot.pages.some((page) => page.pageId === next.pageId)
    || snapshot.urls.some((url) => url.kind === UrlKind.PAGE && url.pageId === next.pageId)
  ) {
    throw new RoutingConflictError('Page is missing or already has a URL');
  }

  const descendants = new Set(snapshot.urls.filter((url) => url.kind === UrlKind.PAGE
    && url.path.startsWith(prefix)).map((url) => url.pageId));
  const children = snapshot.pages.filter((page) => descendants.has(page.pageId)
    && !descendants.has(page.parentPageId ?? null)).map((page) => page.pageId);
  let pages = [...snapshot.pages];

  for (const pageId of children) {
    assertPageParent(next.siteId, pageId, next.pageId, pages);
    pages = pages.map((page) => page.pageId === pageId ? { ...page, parentPageId: next.pageId } : page);
  }

  return children;
}
