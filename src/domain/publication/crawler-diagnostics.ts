import type { PublishedRoute } from './published-route.js';
import { PublishedRouteKind } from './published-route.js';

export enum SitemapExclusion {
  Unpublished = 'Unpublished',
  SystemDocument = 'SystemDocument',
  Noindex = 'Noindex',
  Explicit = 'Explicit',
  Robots = 'Robots',
  NoOrigin = 'NoOrigin',
}

export interface IRobotsBlock {
  readonly agent: string;
  readonly rule: string;
  readonly line: number;
}

export interface ICrawlerDiagnostics {
  readonly pageId: string;
  readonly path: string;
  readonly inSitemap: boolean;
  readonly reason: SitemapExclusion | null;
  readonly robotsAvailable: boolean;
  readonly blockedBy: readonly IRobotsBlock[];
}

export function sitemapExclusion(route: PublishedRoute, blocked: boolean): SitemapExclusion | null {
  if (route.kind === PublishedRouteKind.Redirect) {
    return SitemapExclusion.Unpublished;
  }
  if (route.systemDocument) {
    return SitemapExclusion.SystemDocument;
  }
  if (route.robotsIndex === false) {
    return SitemapExclusion.Noindex;
  }
  if (route.excludeFromSitemap) {
    return SitemapExclusion.Explicit;
  }

  return blocked ? SitemapExclusion.Robots : null;
}
