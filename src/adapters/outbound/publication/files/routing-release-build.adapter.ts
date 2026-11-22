import { parseFragment, serialize } from 'parse5';

import { SystemDocument } from '../../../../domain/pages/document-mime.js';
import { documentArtifactPath } from '../../../../domain/publication/document-artifact-path.js';
import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import type { IPublishedPageSummary } from '../../../../domain/publication/published-page-summary.js';
import type { PublishedRoute } from '../../../../domain/publication/published-route.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { validateUrlGraph } from '../../../../domain/routing/url-graph-change.policy.js';
import { UrlKind } from '../../../../domain/routing/url-kind.enum.js';
import { requireAssetPath, requireCondition } from '../../../../domain/shared/validation.js';
import type {
  IJsonLdReleaseProjectionPort,
} from '../../../../ports/outbound/json-ld/json-ld-release-projection.port.js';
import type { IBuiltPublication } from '../../../../ports/outbound/publication/frontend-build.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../../ports/outbound/publication/publication-artifact-source.port.js';
import type {
  IRoutingReleaseBuildInput, IRoutingReleaseBuildPort,
} from '../../../../ports/outbound/publication/routing-release-build.port.js';
import { isSiteFaviconLink } from '../../rendering/html/favicon-head.js';
import { prepareCompiledAssets } from '../../rendering/html/inline-style-hashes.js';
import { walkHtml } from '../../rendering/modx/html-safety.js';
import { artifact } from '../../rendering/vite/artifacts.js';
import { rebuildSitemap } from './crawler-artifacts.js';
import { decodePlan } from './plan-decoder.js';
import { sitemapArtifact, sitemapPaths } from './sitemap.js';

async function read(file: IPublicationArtifact): Promise<string> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of file.content.bytes) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

export class RoutingReleaseBuildAdapter implements IRoutingReleaseBuildPort {
  constructor(private readonly source: IPublicationArtifactSourcePort,
    private readonly structured?: IJsonLdReleaseProjectionPort) {}

  async build(input: IRoutingReleaseBuildInput): Promise<IBuiltPublication> {
    validateUrlGraph(input.siteId, input.urls);
    const previous = input.previous;

    requireCondition(previous.siteId === input.siteId && previous.manifest !== null, 'Foreign routing release');
    const manifest = previous.manifest!;
    const oldFiles = await this.source.readArtifacts(input.siteId, previous.releaseId);

    requireCondition(oldFiles.length === manifest.artifacts.length && manifest.artifacts.every((expected) =>
      oldFiles.some((file) => file.path === expected.path && file.checksum === expected.checksum
        && file.byteSize === expected.byteSize && file.public === expected.public && file.mimeType
          === expected.mimeType)),
    'Retained artifacts differ from the selected release');
    const pages = new Map(manifest.routes.flatMap((route) => route.kind === PublishedRouteKind.Redirect ? []
      : [[route.pageId, route]]));
    const oldDocuments = new Set(manifest.routes.flatMap((route) => route.kind === PublishedRouteKind.Static
      ? [route.documentPath, ...(route.markdownPath ? [route.markdownPath] : [])]
      : route.kind === PublishedRouteKind.Request ? [`plans/${route.renderPlanId}.json`] : []));
    const files = new Map(oldFiles.filter((file) => !oldDocuments.has(file.path)
      && file.path !== '_redirects' && file.path !== 'sitemap.xml').map((file) => [file.path, file]));
    const routes: PublishedRoute[] = [];
    const oldRules = oldFiles.find((file) => file.path === '_redirects');
    const aliases = oldRules ? (await read(oldRules)).split('\n')
      .filter((rule) => /^\/assets\/releases\/[A-Za-z0-9_%~-]+\/\* \/assets\/:splat 200$/.test(rule)) : [];
    const permittedAssetPrefixes = new Set([
      `/assets/releases/${encodeURIComponent(previous.releaseId)}/`,
      ...aliases.map((rule) => rule.slice(0, rule.indexOf('*'))),
    ]);
    const rebaseAssets = (html: string): string => {
      const tree = parseFragment(html);

      walkHtml(tree, (node) => {
        if (!('tagName' in node) || !['script', 'link'].includes(node.tagName) || isSiteFaviconLink(node)) {
          return;
        }

        const attributeName = node.tagName === 'script' ? 'src' : 'href';
        const attribute = node.attrs.find((attribute) => attribute.name === attributeName);

        if (!attribute) {
          return;
        }

        const prefix = [...permittedAssetPrefixes].find((prefix) => attribute.value.startsWith(prefix));
        const relative = prefix ? 'assets/' + attribute.value.slice(prefix.length)
          : attribute.value.startsWith('/assets/') && !attribute.value.startsWith('/assets/releases/')
            ? attribute.value.slice(1) : null;

        requireCondition(relative !== null && files.get(relative)?.public === true, 'Foreign or missing frozen asset');
        attribute.value = `/assets/releases/${encodeURIComponent(input.releaseId)}/` + relative!.slice('assets/'.length);
      });

      return serialize(tree);
    };
    const add = (file: IPublicationArtifact): void => {
      requireCondition(!files.has(file.path), 'Routing artifact collision');
      files.set(file.path, file);
    };
    const current = new Map(input.urls.map((url) => [url.urlId, url]));
    const mapCatalog = (summaries: readonly IPublishedPageSummary[]): IPublishedPageSummary[] =>
      summaries.flatMap((summary) => {
        const url = input.urls.find((url) => url.kind === UrlKind.PAGE && url.pageId === summary.pageId);

        return url && pages.has(summary.pageId) ? [{
          ...summary,
          urlId: url.urlId,
          path: url.path,
          parentUrlId:
        url.parentUrlId,
        }] : [];
      });

    for (const url of input.urls) {
      requireCondition((url.path !== '/sitemap.xml'
        || pages.get(url.pageId ?? '')?.systemDocument === SystemDocument.Sitemap)
        && !/^\/(?:api|admin|assets)(?:\/|$)/.test(url.path), 'Reserved route');

      if (url.kind === UrlKind.REDIRECT) {
        let target = current.get(url.redirectTargetUrlId!);
        const visited = new Set([url.urlId]);

        while (target?.kind === UrlKind.REDIRECT) {
          requireCondition(!visited.has(target.urlId), 'Redirect cycle');
          visited.add(target.urlId);
          target = current.get(target.redirectTargetUrlId!);
        }
        requireCondition(target !== undefined, 'Missing redirect destination');
        routes.push({
          kind: PublishedRouteKind.Redirect,
          urlId: url.urlId,
          path: url.path,
          targetUrlId: url.redirectTargetUrlId!,
          targetPath: target!.path,
          status: url.redirectStatus!,
        });
        continue;
      }

      const saved = pages.get(url.pageId!);

      if (!saved) {
        continue;
      }
      if (saved.kind === PublishedRouteKind.Static) {
        const document = oldFiles.find((file) => file.path === saved.documentPath);
        const documentPath = documentArtifactPath(url.path, document?.mimeType ?? 'text/html');

        requireAssetPath(documentPath);
        requireCondition(document?.public === true, 'Missing frozen document');

        if (saved.systemDocument !== SystemDocument.Sitemap) {
          add({ ...document!, path: documentPath });
        }
        if (saved.markdownPath) {
          const markdown = oldFiles.find((file) => file.path === saved.markdownPath);

          requireCondition(markdown?.public === true && markdown.mimeType === 'text/markdown',
            'Missing frozen Markdown representation');
          add(markdown!);
        }
        routes.push({ ...saved, urlId: url.urlId, path: url.path, documentPath });
      } else {
        const planFile = oldFiles.find((file) => file.path === `plans/${saved.renderPlanId}.json`);

        requireCondition(planFile !== undefined && !planFile.public, 'Missing frozen request plan');
        const decoded = decodePlan(JSON.parse(await read(planFile!)));

        requireCondition(decoded.plan.siteId === input.siteId && decoded.plan.pageId === saved.pageId,
          'Foreign frozen plan');
        add(artifact(planFile!.path, 'application/json', JSON.stringify({
          ...decoded.plan,
          ...(decoded.plan.publishedPages === undefined ? {} : {
            publishedPages:
            mapCatalog(decoded.plan.publishedPages),
          }),
          assets: prepareCompiledAssets({
            head: rebaseAssets(decoded.assets.head),
            body: rebaseAssets(decoded.assets.body),
          }),
        }), false));
        routes.push({ ...saved, urlId: url.urlId, path: url.path });
      }
    }
    aliases.push(`/assets/releases/${encodeURIComponent(input.releaseId)}/* /assets/:splat 200`);
    aliases.push(`/assets/releases/${encodeURIComponent(previous.releaseId)}/* /assets/:splat 200`);
    const rules = routes.flatMap((route) => route.kind === PublishedRouteKind.Redirect
      ? [`${route.path} ${route.targetPath} ${route.status}`] : []);

    add(artifact('_redirects', 'text/plain', [...rules, ...new Set(aliases)].join('\n') + '\n'));
    const oldSitemap = oldFiles.find((file) => file.path === 'sitemap.xml');

    if (input.publicOrigin && oldSitemap) {
      const indexed = new Set(sitemapPaths(await read(oldSitemap)));
      const indexedPages = new Set(manifest.routes.flatMap((route) => route.kind !== PublishedRouteKind.Redirect
        && indexed.has(route.path) ? [route.pageId] : []));

      add(sitemapArtifact(input.publicOrigin, routes.flatMap((route) => route.kind !== PublishedRouteKind.Redirect
        && indexedPages.has(route.pageId) ? [route.path] : [])));
    }

    const mappedSitemap = files.get('sitemap.xml') ?? oldSitemap;
    let artifacts = await rebuildSitemap([...files.values()], routes, input.publicOrigin ?? undefined,
      mappedSitemap ? sitemapPaths(await read(mappedSitemap)) : [],
      `/assets/releases/${encodeURIComponent(input.releaseId)}/`);

    requireCondition(this.structured !== undefined || !artifacts.some((file) => file.path.startsWith('json-ld/')),
      'JSON-LD routing projection is not configured');

    if (this.structured) {
      artifacts = await this.structured.refresh({
        siteId: input.siteId, ...(input.publicOrigin ? { origin: input.publicOrigin } : {}), routes, artifacts,
      });
    }

    return {
      artifacts,
      manifest: {
        routes,
        ...(manifest.publishedPages === undefined ? {} : { publishedPages: mapCatalog(manifest.publishedPages) }),
        artifacts: artifacts.map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
          ({ path, mimeType, byteSize, checksum, public: publicFile })),
      },
    };
  }
}
