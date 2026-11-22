import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { minify } from 'html-minifier-terser';
import obfuscator from 'javascript-obfuscator';
import parseSrcset from 'parse-srcset';
import { parse, serialize } from 'parse5';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import ts from 'typescript';
import { build } from 'vite';

import { documentMimeType, SystemDocument } from '../../../../domain/pages/document-mime.js';
import { BrowserInteraction } from '../../../../domain/pages/page-rendering.js';
import { documentArtifactPath } from '../../../../domain/publication/document-artifact-path.js';
import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import type { PublishedRoute } from '../../../../domain/publication/published-route.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { UrlKind } from '../../../../domain/routing/url-kind.enum.js';
import { requireAssetPath, requireCondition } from '../../../../domain/shared/validation.js';
import type {
  IBuiltPublication,
  IFrontendBuildInput,
  IFrontendBuildPort,
} from '../../../../ports/outbound/publication/frontend-build.port.js';
import type { IMarkdownConversionPort } from '../../../../ports/outbound/publication/markdown-conversion.port.js';
import { rebuildSitemap } from '../../publication/files/crawler-artifacts.js';
import { jsonLdPagePath } from '../../publication/files/json-ld-artifacts.js';
import { pageSnapshotPath } from '../../publication/files/page-content-snapshot.js';
import { sitemapArtifact } from '../../publication/files/sitemap.js';
import { digestFile, fileContent } from '../../storage/files/binary-file.js';
import { faviconHead } from '../html/favicon-head.js';
import { prepareCompiledAssets } from '../html/inline-style-hashes.js';
import { walkHtml } from '../modx/html-safety.js';
import { artifact, checksum } from './artifacts.js';
import { cssCouplings, splitCss } from './css.js';
import type { IFrontendSourceLocations } from './frontend-source-locations.js';

export class FrontendBuildAdapter implements IFrontendBuildPort {
  constructor(private readonly publicMediaPath: string | undefined,
    private readonly locations: IFrontendSourceLocations | undefined,
    private readonly markdown: IMarkdownConversionPort) {}

  async build(input: IFrontendBuildInput): Promise<IBuiltPublication> {
    const { snapshot } = input;
    const assetBasePath = input.assetBasePath ?? '/assets/';

    requireCondition(/^\/assets\/(?:releases\/[A-Za-z0-9_%~-]+\/)?$/.test(assetBasePath), 'Invalid compiled asset base path');
    const assetUrl = (relative: string): string => assetBasePath + relative.slice('assets/'.length);
    const artifacts: IPublicationArtifact[] = [];
    const routes: PublishedRoute[] = [];
    const sources = snapshot.frontendSources;
    const base = sources.some((source) => source.id === 'site')
      ? this.locations?.directory(snapshot.siteKey, 'site') : undefined;
    const directory = (sourceId: string): string | undefined => this.locations?.directory(snapshot.siteKey, sourceId);
    const media = new Map<string, string>();
    const asset = async (reference: string, directory: string): Promise<string> => {
      if (
        this.publicMediaPath
        && (reference.startsWith(this.publicMediaPath + '/files/')
        || reference.startsWith(this.publicMediaPath + '/images/'))
      ) {
        const pathname = new URL(reference, 'https://media.invalid').pathname;

        requireCondition(!/%(?:2f|5c)/i.test(pathname) && !reference.includes('\\')
          && (pathname.startsWith(this.publicMediaPath + '/files/')
            || pathname.startsWith(this.publicMediaPath + '/images/')), 'Invalid library asset URL');

        return reference;
      }
      if (/^(?:https?:|mailto:|tel:|#)/.test(reference)) {
        return reference;
      }
      requireCondition(!reference.startsWith('//') && !/[?\\]/.test(reference), 'Unsupported authored asset URL');
      requireCondition(base !== undefined, 'Local assets require a configured site directory');
      const filename = reference.startsWith('/') ? path.join(base!, reference.slice(1))
        : path.resolve(directory, reference);
      const canonicalBase = await realpath(base!);
      const canonical = await realpath(filename);

      requireCondition(canonical.startsWith(`${canonicalBase}${path.sep}`), 'Asset escapes site source');
      const existing = media.get(canonical);

      if (existing) {
        return existing;
      }

      const ext = path.extname(canonical).toLowerCase();
      const types: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.avif': 'image/avif',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.pdf': 'application/pdf',
      };

      requireCondition(types[ext] !== undefined, 'Unsupported authored asset format');
      const mimeType = types[ext]!;
      const verified = await digestFile(canonical);
      const output = `assets/media/${verified.checksum.slice(0, 20)}${ext}`;

      artifacts.push({
        path: output,
        mimeType,
        byteSize: verified.byteSize,
        checksum: verified.checksum,
        public: true,
        content: fileContent(canonical, verified.byteSize, mimeType),
      });
      media.set(canonical, assetUrl(output));

      return assetUrl(output);
    };
    const cssSources = [];

    for (const source of sources) {
      const root = postcss.parse(source.css);
      const urls: { node: valueParser.Node;
        reference: string;
        parsed:
        valueParser.ParsedValue;
        declaration: postcss.Declaration }[] = [];

      root.walkDecls((declaration) => {
        const parsed = valueParser(declaration.value);

        parsed.walk((node) => {
          if (node.type === 'function' && node.value === 'url') {
            const reference = node.nodes[0]?.value ?? '';

            urls.push({ node, reference, parsed, declaration });

            return false;
          }
        });
      });

      for (const entry of urls) {
        const url = await asset(entry.reference, directory(source.id) ?? base ?? '');

        if (entry.node.type === 'function') {
          entry.node.nodes = [{ type: 'word', value: url, sourceIndex: 0, sourceEndIndex: url.length }];
        }
        entry.declaration.value = entry.parsed.toString();
      }
      cssSources.push({ ...source, css: root.toString() });
    }
    const blocked = cssCouplings(cssSources.map((source) => source.css));
    const split = new Map<string, { reflow: string; repaint: string }>();

    for (const source of cssSources) {
      split.set(source.id, await splitCss(source.css, blocked));
    }
    const compositions = [...input.documents, ...input.requestPlans];
    const common = sources.filter((source) => source.id === 'site'
      || compositions.filter((item) => item.frontendSourceIds.includes(
        source.id)).length > 1).map((source) => source.id);
    const commonLinks: Record<string, string> = { reflow: '', repaint: '' };

    for (const group of ['reflow', 'repaint'] satisfies readonly ('reflow' | 'repaint')[]) {
      const css = common.map((id) => split.get(id)?.[group] ?? '').join('');

      if (!css) {
        continue;
      }

      const output = `assets/styles/common.${group}.${checksum(new TextEncoder().encode(css)).slice(0, 20)}.css`;

      artifacts.push(artifact(output, 'text/css', css));
      commonLinks[group] = `<link rel="stylesheet" href="${assetUrl(output)}">`;
    }
    const scripts = new Map<string, string>();

    for (const source of sources) {
      if (!source.browserTypeScript || !compositions.some((item) => item.frontendSourceIds.includes(source.id))) {
        continue;
      }

      const entryId = path.resolve(directory(source.id) ?? '.', 'client.ts').replaceAll('\\', '/');
      const output = await build({
        configFile: false,
        envDir: false,
        publicDir: false,
        logLevel: 'silent',
        define: { 'import.meta.env': '{}' },
        plugins: [{
          name: 'zarya-browser-boundary',
          enforce: 'pre',
          resolveId(id, importer): string | null {
            if (id.replaceAll('\\', '/') === entryId) {
              return entryId;
            }
            if (importer) {
              requireCondition(id.startsWith('.') && !id.includes('node_modules'),
                'Browser imports must stay inside site sources');
              const filename = path.resolve(importer === entryId
                ? directory(source.id) ?? '' : path.dirname(importer), id);

              requireCondition(base !== undefined && filename.startsWith(`${base}${path.sep}`), 'Browser import escapes site sources');
              requireCondition(!/\.(?:config|settings)\.[cm]?[jt]s$/.test(filename), 'Configuration cannot enter browser code');

              return path.extname(filename) ? filename : `${filename}.ts`;
            }

            return null;
          },
          async load(id): Promise<string | null> {
            if (id !== entryId && base && id.startsWith(base.replaceAll('\\', '/'))) {
              const actual = await realpath(id);
              const root = await realpath(base);

              requireCondition(actual.startsWith(`${root}${path.sep}`), 'Browser import escapes site sources');
              requireCondition(/\.[cm]?[jt]s$/.test(actual), 'Browser imports must be script modules');

              return readFile(actual, 'utf8');
            }

            return id === entryId ? source.browserTypeScript : null;
          },
        }],
        build: {
          write: false,
          minify: true,
          sourcemap: 'hidden',
          lib: { entry: entryId, formats: ['es'] },
          rolldownOptions: { output: { codeSplitting: false } },
        },
      });
      const bundles = Array.isArray(output) ? output : 'output' in output ? [output] : [];

      requireCondition(bundles.length === 1, 'Expected one browser bundle');
      const chunks = bundles.flatMap((bundle) => bundle.output).filter((entry) => entry.type === 'chunk');

      requireCondition(chunks.length === 1, 'Browser entry must produce one self-contained module');
      const code = chunks[0]!.code;

      if (
        compositions.some((item) => item.frontendSourceIds.includes(source.id)
        && snapshot.pages.find((page) =>
          page.pageId === item.pageId)?.rendering?.interaction === BrowserInteraction.None)
      ) {
        const tree = ts.createSourceFile('browser.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const inspect = (node: ts.Node): void => {
          const name = ts.isIdentifier(node) ? node.text
            : ts.isStringLiteral(node) && ts.isElementAccessExpression(node.parent) ? node.text : '';

          requireCondition(!['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'].includes(name),
            'Browser API interaction requires interaction=Api');
          ts.forEachChild(node, inspect);
        };

        inspect(tree);
      }

      const obfuscated = obfuscator.obfuscate(code, {
        target: 'browser-no-eval',
        compact: true,
        seed: 1,
        stringArray: false,
        renameGlobals: false,
        renameProperties: false,
        sourceMap: false,
      });
      const compiled = obfuscated.getObfuscatedCode();
      const entryName = source.id.replace(/[^A-Za-z0-9_-]/g, '-');
      const outputPath = `assets/scripts/${entryName}.${checksum(new TextEncoder().encode(compiled)).slice(0, 20)}.js`;

      scripts.set(source.id, `<script type="module" src="${assetUrl(outputPath)}"></script>`);
      artifacts.push(artifact(outputPath, 'text/javascript', compiled));

      if (chunks[0]!.map) {
        artifacts.push(artifact(`diagnostics/${checksum(new TextEncoder().encode(code)).slice(0, 20)}.map`,
          'application/json', JSON.stringify(chunks[0]!.map), false));
      }
    }
    const injections = (ids: readonly string[]): { head: string; body: string } => {
      const inline = (group: 'reflow' | 'repaint'): string => {
        const css = ids.filter((id) => !common.includes(id)).map((id) => split.get(id)?.[group] ?? '').join('');

        requireCondition(!css.toLowerCase().includes('</style'), 'Unsafe inline stylesheet');

        return css ? `<style data-zarya="page-${group}">${css}</style>` : '';
      };

      return {
        head: faviconHead(commonLinks.reflow + inline('reflow'), snapshot.favicon),
        body: ids.map((id) => scripts.get(id) ?? '').join('')
        + commonLinks.repaint + inline('repaint'),
      };
    };

    for (const document of input.documents) {
      const url = snapshot.urls.find((url) => url.kind === UrlKind.PAGE && url.pageId === document.pageId);
      const routePath = url?.path ?? '/';

      requireCondition(!/^\/(?:api|admin|assets)(?:\/|$)/.test(routePath), 'Document path collides with a reserved entry');
      const page = snapshot.pages.find((page) => page.pageId === document.pageId);
      const mimeType = documentMimeType(page?.mimeType);
      const outputPath = documentArtifactPath(routePath, mimeType);

      requireAssetPath(outputPath);
      requireCondition(!['manifest.json', '_headers', '_redirects', 'plans', 'content']
        .includes(outputPath.split('/')[0]!), 'Reserved document artifact path');
      const indexing = {
        mimeType,
        robotsIndex: page?.robotsIndex ?? true,
        excludeFromSitemap: page?.excludeFromSitemap ?? false,
        systemDocument: page?.systemDocument ?? null,
      };

      if (mimeType !== 'text/html') {
        if (page?.systemDocument !== SystemDocument.Sitemap) {
          artifacts.push(artifact(outputPath, mimeType, document.html));
        }
        routes.push({
          ...indexing,
          kind: PublishedRouteKind.Static,
          urlId: url?.urlId ?? document.pageId,
          path: routePath,
          pageId: document.pageId,
          documentPath: outputPath,
        });
        continue;
      }
      if (document.jsonLd) {
        artifacts.push(artifact(jsonLdPagePath(document.pageId), 'application/json',
          JSON.stringify(document.jsonLd.input), false));
      }

      const tree = parse(document.html);
      const replacements: (() => Promise<void>)[] = [];

      walkHtml(tree, (node) => {
        if (!('tagName' in node)) {
          return;
        }
        if (node.tagName === 'img') {
          requireCondition(['width', 'height'].every((name) => node.attrs.some((attribute) => attribute.name === name
            && /^[1-9]\d*$/.test(attribute.value))), 'Images require actual width and height');
        }

        for (const attribute of node.attrs) {
          if (['srcset', 'imagesrcset'].includes(attribute.name)) {
            replacements.push(() => Promise.all(parseSrcset(attribute.value).map(async (candidate) => [
              await asset(candidate.url, base ?? ''),
              ...(candidate.w === undefined ? [] : [candidate.w + 'w']),
              ...(candidate.d === undefined ? [] : [candidate.d + 'x']),
            ].join(' '))).then((values) => {
              attribute.value = values.join(', ');
            }));
          }
          if (['src', 'poster'].includes(attribute.name) && !/^https?:/.test(attribute.value)) {
            replacements.push(() => asset(attribute.value, base ?? '').then((value) => {
              attribute.value = value;
            }));
          }
        }
      });
      const completed = await Promise.allSettled(replacements.map((replace) => Promise.resolve().then(replace)));

      for (const result of completed) {
        if (result.status === 'rejected') {
          throw result.reason;
        }
      }
      const inject = injections(document.frontendSourceIds);
      const html = serialize(tree).replace('</head>', `${inject.head}</head>`).replace('</body>', `${inject.body}</body>`);
      const markdownPath = `representations/${checksum(new TextEncoder().encode(document.pageId))}.md`;

      artifacts.push(artifact(markdownPath, 'text/markdown', this.markdown.toMarkdown(html)));
      artifacts.push(artifact(outputPath, 'text/html', await minify(html, {
        collapseWhitespace: true,
        removeComments: true,
        keepClosingSlash: true,
        removeAttributeQuotes: false,
      })));
      routes.push({
        ...indexing,
        kind: PublishedRouteKind.Static,
        urlId: url?.urlId ?? document.pageId,
        path: routePath,
        pageId: document.pageId,
        documentPath: outputPath,
        markdownPath,
      });
    }

    for (const plan of input.requestPlans) {
      const url = snapshot.urls.find((url) => url.kind === UrlKind.PAGE && url.pageId === plan.pageId);

      requireCondition(url !== undefined, 'Request page requires a route');
      artifacts.push(artifact(`plans/${plan.planId}.json`, 'application/json', JSON.stringify({
        ...plan,
        assets: prepareCompiledAssets(injections(plan.frontendSourceIds)),
      }), false));
      routes.push({
        mimeType: 'text/html',
        robotsIndex: plan.page.robotsIndex,
        excludeFromSitemap: plan.page.excludeFromSitemap ?? false,
        kind: PublishedRouteKind.Request,
        urlId: url!.urlId,
        path: url!.path,
        pageId: plan.pageId,
        renderPlanId: plan.planId,
      });
    }

    for (const url of snapshot.urls.filter((url) => url.kind === UrlKind.REDIRECT)) {
      requireCondition(url.redirectTargetUrlId !== null && url.redirectStatus !== null, 'Broken retained redirect');
      let targetId = url.redirectTargetUrlId!;
      const visited = new Set([url.urlId]);
      let targetPath = '';

      while (true) {
        requireCondition(!visited.has(targetId), 'Corrupt saved redirect cycle');
        visited.add(targetId);
        const target = snapshot.urls.find((entry) => entry.urlId === targetId);

        requireCondition(target !== undefined, 'Corrupt saved redirect target');

        if (!target) {
          throw new Error('Missing saved redirect target');
        }
        if (target.kind !== UrlKind.REDIRECT) {
          targetPath = target.path;
          break;
        }
        targetId = target.redirectTargetUrlId!;
      }
      routes.push({
        kind: PublishedRouteKind.Redirect,
        urlId: url.urlId,
        path: url.path,
        targetUrlId: url.redirectTargetUrlId!,
        targetPath,
        status: url.redirectStatus!,
      });
    }
    const redirects = routes.filter((route) => route.kind === PublishedRouteKind.Redirect);
    const rules: string[] = [];

    if (redirects.length) {
      requireCondition(redirects.every((route) => !/\s/.test(route.path) && !/\s/.test(route.targetPath ?? '')),
        'Redirect export requires URL-encoded paths');
      rules.push(...redirects.map((route) => `${route.path} ${route.targetPath} ${route.status}`));
    }

    const unique = new Map<string, IPublicationArtifact>();

    requireCondition(!routes.some((route) => route.path === '/sitemap.xml'
      && route.systemDocument !== SystemDocument.Sitemap), 'Sitemap path is reserved');

    if (snapshot.publicOrigin || routes.some((route) => route.systemDocument === SystemDocument.Sitemap)) {
      artifacts.push(sitemapArtifact(snapshot.publicOrigin, []));
    }

    const finalized = await rebuildSitemap(artifacts, routes, snapshot.publicOrigin, [], assetBasePath);

    if (assetBasePath !== '/assets/' && finalized.some((file) => file.public && file.path.startsWith('assets/'))) {
      rules.push(`${assetBasePath}* /assets/:splat 200`);
    }
    if (rules.length) {
      finalized.push(artifact('_redirects', 'text/plain', rules.join('\n') + '\n'));
    }

    for (const item of finalized) {
      const previous = unique.get(item.path);

      requireCondition(!previous || (previous.checksum === item.checksum && previous.public === item.public
        && previous.mimeType === item.mimeType), 'Publication artifact path collision');
      unique.set(item.path, item);
    }

    for (const page of snapshot.pages) {
      if (routes.some((route) => route.kind !== PublishedRouteKind.Redirect && route.pageId === page.pageId)) {
        const file = artifact(pageSnapshotPath(page.pageId), 'application/json', JSON.stringify(page), false);

        requireCondition(!unique.has(file.path), 'Reserved published page content path');
        unique.set(file.path, file);
      }
    }

    for (const file of unique.keys()) {
      const parts = file.split('/');

      for (let depth = 1; depth < parts.length; depth++) {
        requireCondition(!unique.has(parts.slice(0, depth).join('/')), 'Document file conflicts with a directory');
      }
    }
    const output = [...unique.values()];

    return {
      artifacts: output,
      manifest: {
        routes,
        artifacts: output.map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
          ({ path, mimeType, byteSize, checksum, public: publicFile })),
      },
    };
  }
}
