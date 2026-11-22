import { mergePageRoutes } from '../../../../domain/publication/page-release.policy.js';
import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type {
  IJsonLdReleaseProjectionPort,
} from '../../../../ports/outbound/json-ld/json-ld-release-projection.port.js';
import type {
  IBuiltPublication,
  IFrontendBuildPort,
} from '../../../../ports/outbound/publication/frontend-build.port.js';
import type {
  IPageReleaseBuildInput, IPageReleaseBuildPort,
} from '../../../../ports/outbound/publication/page-release-build.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../../ports/outbound/publication/publication-artifact-source.port.js';
import { isSiteFaviconLink } from '../../rendering/html/favicon-head.js';
import { prepareCompiledAssets } from '../../rendering/html/inline-style-hashes.js';
import { walkHtml } from '../../rendering/modx/html-safety.js';
import { artifact } from '../../rendering/vite/artifacts.js';
import { artifactText, rebuildSitemap } from './crawler-artifacts.js';
import { jsonLdPagePath } from './json-ld-artifacts.js';
import { pageSnapshotPath } from './page-content-snapshot.js';
import { decodePlan } from './plan-decoder.js';
import { sitemapArtifact, sitemapPaths } from './sitemap.js';

async function readSitemapPaths(file: IPublicationArtifact): Promise<string[]> {
  return sitemapPaths(await artifactText(file, 50 * 1024 * 1024));
}

export class PageReleaseBuildAdapter implements IPageReleaseBuildPort {
  constructor(private readonly frontend: IFrontendBuildPort,
    private readonly previousFiles: IPublicationArtifactSourcePort,
    private readonly structured?: IJsonLdReleaseProjectionPort) {}

  async buildPage(input: IPageReleaseBuildInput): Promise<IBuiltPublication> {
    const previous = input.previous;

    requireCondition(!previous || previous.siteId === input.snapshot.siteId
      && (!previous.siteKey || previous.siteKey === input.snapshot.siteKey)
      && previous.manifest !== null, 'Foreign base release');
    const oldFiles = previous ? await this.previousFiles.readArtifacts(previous.siteId, previous.releaseId) : [];

    requireCondition(!previous || oldFiles.length === previous.manifest!.artifacts.length
      && previous.manifest!.artifacts.every((expected) => oldFiles.some((file) => file.path === expected.path
        && file.public === expected.public && file.mimeType === expected.mimeType
        && file.byteSize === expected.byteSize && file.checksum === expected.checksum)),
    'Retained artifacts differ from the selected release');
    const built = await this.frontend.build(input);
    const routes = mergePageRoutes(previous?.manifest ?? null, built.manifest, input.pageId);
    const removed = new Set(previous?.manifest?.routes.flatMap((route) => {
      if (route.kind === PublishedRouteKind.Redirect || route.pageId !== input.pageId) {
        return [];
      }

      return route.kind === PublishedRouteKind.Static
        ? [route.documentPath, ...(route.markdownPath ? [route.markdownPath] : [])]
        : [`plans/${route.renderPlanId}.json`];
    }) ?? []);

    removed.add(pageSnapshotPath(input.pageId));
    removed.add(jsonLdPagePath(input.pageId));
    const files = new Map<string, IPublicationArtifact>(oldFiles.filter((file) =>
      !removed.has(file.path) && file.path !== '_redirects' && file.path !== 'sitemap.xml').map((file) =>
      [file.path, file]));

    for (const file of built.artifacts.filter((file) => file.path !== '_redirects' && file.path !== 'sitemap.xml')) {
      const old = files.get(file.path);

      requireCondition(!old || old.checksum === file.checksum && old.public === file.public
        && old.mimeType === file.mimeType, 'Conflicting retained artifact');
      files.set(file.path, file);
    }

    for (const route of routes) {
      if (route.kind !== PublishedRouteKind.Request || route.pageId === input.pageId) {
        continue;
      }

      const filename = `plans/${route.renderPlanId}.json`;
      const file = files.get(filename);

      requireCondition(file !== undefined && !file.public, 'Missing retained Request plan');
      const chunks: Uint8Array[] = [];

      for await (const chunk of file!.content.bytes) {
        chunks.push(chunk);
      }
      const saved = decodePlan(JSON.parse(Buffer.concat(chunks).toString('utf8')));

      requireCondition(saved.plan.siteId === input.snapshot.siteId && saved.plan.pageId === route.pageId
        && saved.plan.planId === route.renderPlanId, 'Foreign retained Request plan');
      const rebase = (html: string): string => {
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

          const prefix = `/assets/releases/${encodeURIComponent(previous!.releaseId)}/`;

          if (attribute.value.startsWith(prefix)) {
            const relative = attribute.value.slice(prefix.length);

            requireCondition(files.get('assets/' + relative)?.public === true, 'Missing retained plan asset');
            attribute.value = `/assets/releases/${encodeURIComponent(input.releaseId)}/${relative}`;
          } else {
            requireCondition(attribute.value.startsWith('/assets/') && !attribute.value.startsWith('/assets/releases/')
              && files.get(attribute.value.slice(1))?.public === true, 'Foreign retained plan asset');
          }
        });

        return serialize(tree);
      };

      files.set(filename, artifact(filename, 'application/json', JSON.stringify({
        ...saved.plan,
        assets: prepareCompiledAssets({ head: rebase(saved.assets.head), body: rebase(saved.assets.body) }),
      }), false));
    }
    const aliases = new Set<string>();
    const oldRules = oldFiles.find((file) => file.path === '_redirects');

    if (oldRules) {
      const chunks: Uint8Array[] = [];

      for await (const chunk of oldRules.content.bytes) {
        chunks.push(chunk);
      }
      const rules = Buffer.concat(chunks).toString('utf8').split('\n');

      for (const rule of rules) {
        if (/^\/assets\/releases\/[A-Za-z0-9_%~-]+\/\* \/assets\/:splat 200$/.test(rule)) {
          aliases.add(rule);
        }
      }
    }
    aliases.add(`/assets/releases/${encodeURIComponent(input.releaseId)}/* /assets/:splat 200`);

    if (previous) {
      aliases.add(`/assets/releases/${encodeURIComponent(previous.releaseId)}/* /assets/:splat 200`);
    }

    const redirects = routes.filter((route) => route.kind === PublishedRouteKind.Redirect).map((route) => {
      const target = routes.find((candidate) => candidate.urlId === route.targetUrlId);
      const path = route.targetPath ?? target?.path;

      requireCondition(path !== undefined && !/\s/.test(path) && !/\s/.test(route.path), 'Invalid redirect export');

      return `${route.path} ${path} ${route.status}`;
    });

    if (redirects.length || [...files.values()].some((file) => file.public && file.path.startsWith('assets/'))) {
      files.set('_redirects', artifact('_redirects', 'text/plain', [...redirects, ...aliases].join('\n') + '\n'));
    }

    let artifacts = [...files.values()];

    if (input.snapshot.publicOrigin && (!previous || oldFiles.some((file) => file.path === 'sitemap.xml'))) {
      const oldSitemap = oldFiles.find((file) => file.path === 'sitemap.xml');
      const nextSitemap = built.artifacts.find((file) => file.path === 'sitemap.xml');
      const read = async (file: IPublicationArtifact | undefined): Promise<string[]> => {
        if (!file) {
          return [];
        }

        const chunks: Uint8Array[] = [];

        for await (const chunk of file.content.bytes) {
          chunks.push(chunk);
        }

        return sitemapPaths(Buffer.concat(chunks).toString('utf8'));
      };
      const retainedPaths = (await read(oldSitemap)).filter((path) => routes.some((route) =>
        route.kind !== PublishedRouteKind.Redirect && route.pageId !== input.pageId && route.path === path));

      artifacts.push(sitemapArtifact(input.snapshot.publicOrigin, [...retainedPaths, ...await read(nextSitemap)]));
    }

    artifacts = await rebuildSitemap(artifacts, routes, input.snapshot.publicOrigin,
      artifacts.some((file) => file.path === 'sitemap.xml')
        ? await readSitemapPaths(artifacts.find((file) => file.path === 'sitemap.xml')!) : [],
      `/assets/releases/${encodeURIComponent(input.releaseId)}/`);

    requireCondition(this.structured !== undefined || !input.snapshot.jsonLd,
      'JSON-LD release projection is not configured');

    if (this.structured) {
      artifacts = await this.structured.refresh({
        siteId: input.snapshot.siteId,
        ...(input.snapshot.jsonLd ? { context: input.snapshot.jsonLd } : {}),
        routes,
        artifacts,
      });
    }

    return {
      artifacts,
      manifest: {
        routes,
        artifacts: artifacts.map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
          ({ path, mimeType, byteSize, checksum, public: publicFile })),
      },
    };
  }
}

import { parseFragment, serialize } from 'parse5';

