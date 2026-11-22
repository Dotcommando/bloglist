import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { splitCss } from '../../src/adapters/outbound/rendering/vite/css.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { source } from '../support/publication.js';

describe('production frontend artifacts', () => {
  it('stores a Markdown representation of the complete static HTML in the release', async () => {
    const toMarkdown = vi.fn<(html: string) => string>(() => '# Complete page');
    const result = await new FrontendBuildAdapter(undefined, undefined, { toMarkdown }).build({
      releaseId: 'snapshot-test',
      snapshot: {
        ...source('Published content'),
        favicon: {
          byteSize: 100, width: 32, height: 32, version: 'a'.repeat(64),
        },
      },
      requestPlans: [],
      documents: [{
        pageId: 'page-1',
        html: '<html><head></head><body><h1>Complete page</h1></body></html>',
        frontendSourceIds: [],
      }],
    });
    const route = result.manifest.routes.find((item) => item.kind === PublishedRouteKind.Static);

    expect(route?.markdownPath).toBeDefined();
    const file = result.artifacts.find((item) => item.path === route?.markdownPath);

    expect(file?.mimeType).toBe('text/markdown');
    expect(file?.public).toBe(true);
    expect(toMarkdown).toHaveBeenCalledOnce();
    expect(toMarkdown.mock.calls[0]?.[0]).toContain('href="/favicon.ico?v=' + 'a'.repeat(64) + '"');
  });
  it('retains private JSON-LD input values for later graph-only releases', async () => {
    const input = {
      siteId: 'site-1',
      pageId: 'page-1',
      templateId: 'Main',
      origin: 'https://example.test',
      catalog: { siteId: 'site-1', version: 'v1', profiles: [], objects: [] },
      pageFields: { title: 'Published' },
      templateValues: {},
      snippetValues: { headline: 'Frozen' },
      routes: [],
    };
    const built = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'snapshot-test',
      snapshot: source('Published'),
      requestPlans: [],
      documents: [{
        pageId: 'page-1',
        html: '<h1>Published</h1>',
        frontendSourceIds: [],
        jsonLd: { input, result: null },
      }],
    });
    const saved = built.artifacts.find((file) => file.path.startsWith('json-ld/'));

    expect(saved?.public).toBe(false);
    let serialized = '';

    for await (const bytes of saved!.content.bytes) {
      serialized += new TextDecoder().decode(bytes);
    }
    expect(JSON.parse(serialized)).toEqual(input);
  });

  it('freezes complete page content in private release artifacts', async () => {
    const snapshot = source('Published content');
    const result = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'snapshot-test',
      snapshot,
      requestPlans: [],
      documents: [{
        pageId: 'page-1',
        html: '<html><head></head><body>Published</body></html>',
        frontendSourceIds: [],
      }],
    });
    const file = result.artifacts.find((item) => item.path.startsWith('content/pages/'));

    expect(file).toBeDefined();
    expect(file?.public).toBe(false);
    let json = '';

    for await (const bytes of file!.content.bytes) {
      json += new TextDecoder().decode(bytes);
    }
    expect(JSON.parse(json)).toMatchObject({
      siteId: snapshot.siteId,
      pageId: 'page-1',
      title: snapshot.pages[0]!.title,
    });
  });
  it('compiles an actual TypeScript interaction through the production Vite entry', async () => {
    const snapshot = {
      ...source('Hello'),
      frontendSources: [{
        id: 'client',
        revision: '1',
        css: '',
        browserTypeScript: "const label: string = 'done'; document.body.dataset.result = label;",
      }],
    };
    const result = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'test',
      snapshot,
      requestPlans: [],
      documents: [{ pageId: 'page-1', html: '<html><head></head><body></body></html>', frontendSourceIds: ['client'] }],
    });

    expect(result.artifacts.some((artifact) => artifact.path.endsWith('.js'))).toBe(true);
    expect(result.artifacts.filter((artifact) => artifact.path.endsWith('.map')).every((
      artifact) => !artifact.public)).toBe(true);
  });
  it('rejects undeclared API interaction on a None page', async () => {
    const snapshot = {
      ...source('Hello'),
      frontendSources: [{
        id: 'client',
        revision: '1',
        css: '',
        browserTypeScript: "fetch('/api/private');",
      }],
    };

    await expect(new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'test',
      snapshot,
      requestPlans: [],
      documents: [{ pageId: 'page-1', html: '<html><head></head><body></body></html>', frontendSourceIds: ['client'] }],
    }))
      .rejects.toThrow();
  });
  it('keeps coupled border/reset declarations structural and rejects unsupported lengths', async () => {
    const result = await splitCss('.box {width: 10px; border: 1px solid red; border-color:blue;color:black}', []);

    expect(result.reflow).toContain('border:1px solid blue');
    expect(result.repaint).toContain('color:#000');
    await expect(splitCss('.box {padding: 1rem}', [])).rejects.toThrow();
    await expect(splitCss('@import "hidden.css";', [])).rejects.toThrow();
  });
  it('emits shared external groups and unique inline groups in their required positions', async () => {
    const snapshot = {
      ...source('<button data-click>Click</button>'),
      frontendSources: [
        { id: 'site', revision: '1', css: 'body{margin:0;color:black}', browserTypeScript: null },
        { id: 'unique', revision: '1', css: '.box{width:100px;background-color:red}', browserTypeScript: null },
      ],
    };
    const build = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'release',
      snapshot,
      documents: [{
        pageId: 'page-1',
        html: '<!doctype html><html><head></head><body><div class="box"></div></body></html>',
        frontendSourceIds: ['site', 'unique'],
      }],
      requestPlans: [],
    });
    const htmlArtifact = build.artifacts.find((artifact) => artifact.mimeType === 'text/html');

    expect(htmlArtifact).toBeDefined();
    let html = '';

    for await (const bytes of htmlArtifact!.content.bytes) {
      html += new TextDecoder().decode(bytes);
    }
    expect(html).toMatch(/common\.reflow\.[a-f0-9]+\.css/);
    expect(html).toMatch(/<style data-zarya="page-reflow">.*width:100px.*<\/style><\/head>/);
    expect(html).toMatch(/<style data-zarya="page-repaint">.*background-color:red.*<\/style><\/body>/);
    expect(build.artifacts.filter((artifact) => artifact.path.endsWith('.css'))).toHaveLength(2);
  });
});
