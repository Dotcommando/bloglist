import type { ICrawlerDiagnostics } from './crawler-diagnostics.js';
import type { PublishedRoute } from './published-route.js';

export interface IPublishedRouting {
  readonly crawlerDiagnostics?: readonly ICrawlerDiagnostics[];
  readonly sitemapContent?: string | null;
  readonly releaseId: string;
  readonly routes: readonly PublishedRoute[];
  /** Null means this retained release predates sitemap generation. */
  readonly sitemapPaths: readonly string[] | null;
}
