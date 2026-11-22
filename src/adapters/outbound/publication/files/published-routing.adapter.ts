import { SitemapExclusion, sitemapExclusion } from '../../../../domain/publication/crawler-diagnostics.js';
import { ReleaseState } from '../../../../domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import type { IPublishedRouting } from '../../../../domain/publication/published-routing.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IPublicArtifactPort } from '../../../../ports/outbound/publication/public-artifact.port.js';
import type { IPublicationStorePort } from '../../../../ports/outbound/publication/publication-store.port.js';
import type { IPublishedRoutingPort } from '../../../../ports/outbound/publication/published-routing.port.js';
import type { IReleaseActivationPort } from '../../../../ports/outbound/publication/release-activation.port.js';
import { artifactText } from './crawler-artifacts.js';
import { crawlerRules } from './crawler-rules.js';
import { sitemapPaths } from './sitemap.js';

export class PublishedRoutingAdapter implements IPublishedRoutingPort {
  constructor(private readonly activation: IReleaseActivationPort, private readonly store: IPublicationStorePort,
    private readonly files: IPublicArtifactPort) {}

  async readActive(siteId: string): Promise<IPublishedRouting | null> {
    const active = await this.activation.getActive(siteId);

    if (!active) {
      return null;
    }

    const release = await this.store.read(siteId, active.releaseId);

    requireCondition(active.siteId === siteId && release?.siteId === siteId
      && release.releaseId === active.releaseId && release.state === ReleaseState.Ready && release.manifest !== null,
    'Missing or foreign active routing');
    const metadata = release!.manifest!.artifacts.find((file) => file.path === 'sitemap.xml');
    let paths: string[] | null = null;
    let sitemapContent: string | null = null;

    if (metadata) {
      const file = await this.files.readPublicArtifact(siteId, active.releaseId, 'sitemap.xml');

      requireCondition(file?.siteId === siteId && file.releaseId === active.releaseId
        && file.metadata.path === 'sitemap.xml' && file.metadata.public
        && file.metadata.checksum === metadata.checksum, 'Missing or foreign sitemap');
      const chunks: Uint8Array[] = [];
      let size = 0;

      for await (const chunk of file!.content.bytes) {
        size += chunk.length;
        requireCondition(size <= 50 * 1024 * 1024, 'Sitemap exceeds 50 MiB');
        chunks.push(chunk);
      }
      sitemapContent = Buffer.concat(chunks).toString('utf8');
      paths = sitemapPaths(sitemapContent);
    }

    const robotsMetadata = release!.manifest!.artifacts.find((file) => file.path === 'robots.txt');
    const robotsFile = robotsMetadata
      ? await this.files.readPublicArtifact(siteId, active.releaseId, 'robots.txt') : null;

    requireCondition(!robotsMetadata || robotsFile?.siteId === siteId && robotsFile.releaseId === active.releaseId
      && robotsFile.metadata.checksum === robotsMetadata.checksum, 'Missing or foreign robots');
    const evaluate = crawlerRules(robotsFile ? await artifactText({
      ...robotsFile.metadata, content: robotsFile.content,
    }) : null);
    const crawlerDiagnostics = release!.manifest!.routes.flatMap((route) => {
      if (route.kind === PublishedRouteKind.Redirect) {
        return [];
      }

      const blockedBy = evaluate(route.path).blockedBy;
      const inSitemap = paths?.includes(route.path) ?? false;
      const reason = sitemapExclusion(route, blockedBy.length > 0);

      return [{
        pageId: route.pageId,
        path: route.path,
        inSitemap,
        blockedBy,
        robotsAvailable: robotsFile !== null,
        reason: reason ?? (inSitemap ? null : SitemapExclusion.NoOrigin),
      }];
    });

    return {
      releaseId: active.releaseId,
      routes: release!.manifest!.routes,
      sitemapPaths: paths,
      sitemapContent,
      crawlerDiagnostics,
    };
  }
}
