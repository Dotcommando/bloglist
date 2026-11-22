import { SystemDocument } from '../../../../domain/pages/document-mime.js';
import { sitemapExclusion } from '../../../../domain/publication/crawler-diagnostics.js';
import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import type { PublishedRoute } from '../../../../domain/publication/published-route.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { crawlerRules } from './crawler-rules.js';
import { sitemapArtifact } from './sitemap.js';
import { sitemapStylesheetArtifact } from './sitemap-stylesheet.js';

export async function artifactText(file: IPublicationArtifact, limit = 1024 * 1024): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;

  for await (const chunk of file.content.bytes) {
    size += chunk.byteLength;
    requireCondition(size <= limit, 'Crawler document exceeds its text budget');
    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}

export async function rebuildSitemap(files: readonly IPublicationArtifact[], routes: readonly PublishedRoute[],
  origin: string | undefined, legacyPaths: readonly string[] = [],
  assetBasePath = '/assets/'): Promise<IPublicationArtifact[]> {
  const hasSystemSitemap = routes.some((route) => route.systemDocument === SystemDocument.Sitemap);
  const current = files.find((file) => file.path === 'sitemap.xml');

  if (!hasSystemSitemap && !current) {
    return [...files];
  }

  const robots = files.find((file) => file.path === 'robots.txt');
  const evaluate = crawlerRules(robots ? await artifactText(robots) : null);
  const paths = origin ? routes.flatMap((route) => {
    if (
      sitemapExclusion(route, evaluate(route.path).blockedBy.length > 0) !== null
      || route.kind === PublishedRouteKind.Redirect
      || route.robotsIndex === undefined
      && !legacyPaths.includes(route.path)
    ) {
      return [];
    }

    return [route.path];
  }) : [];
  const stylesheet = sitemapStylesheetArtifact();

  return [
    ...files.filter((file) => file.path !== 'sitemap.xml' && file.path !== stylesheet.path),
    sitemapArtifact(origin, paths, assetBasePath + stylesheet.path.slice('assets/'.length)),
    stylesheet,
  ];
}
