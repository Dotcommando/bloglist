import { jsonLdPagePath } from '../../src/adapters/outbound/publication/files/json-ld-artifacts.js';
import {
  JsonLdReleaseProjectionAdapter,
} from '../../src/adapters/outbound/publication/files/json-ld-release-projection.adapter.js';
import { JsonLdDocumentAdapter } from '../../src/adapters/outbound/rendering/html/json-ld-document.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { BuildJsonLdPageUseCase } from '../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind } from '../../src/domain/json-ld/json-ld-catalog.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';

it('rebuilds retained graphs from frozen inputs without changing the published text', async () => {
  const catalog = {
    siteId: 'site-1',
    version: 'v2',
    objects: [],
    profiles: [{
      profileId: 'article',
      name: 'Article',
      templateIds: ['Article'],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [{
          property: 'headline',
          required: true,
          source: { kind: JsonLdSourceKind.PageField as const, name: 'title' },
        }],
      }],
    }],
  };
  const frozen = {
    siteId: 'site-1',
    pageId: 'page-1',
    templateId: 'Article',
    origin: 'https://old.test',
    catalog: { ...catalog, version: 'v1' },
    routes: [],
    pageFields: { title: 'Published title' },
    templateValues: {},
    snippetValues: {},
  };
  const project = new JsonLdReleaseProjectionAdapter(new BuildJsonLdPageUseCase(), new JsonLdDocumentAdapter());
  const files = await project.refresh({
    siteId: 'site-1',
    context: { catalog, origin: 'https://new.test', routes: [] },
    routes: [{
      kind: PublishedRouteKind.Static, pageId: 'page-1', urlId: 'url-1', path: '/', documentPath: 'index.html',
    }],
    artifacts: [artifact('index.html', 'text/html', '<h1>Published text</h1>'),
      artifact(jsonLdPagePath('page-1'), 'application/json', JSON.stringify(frozen), false)],
  });
  const html = files.find((file) => file.path === 'index.html')!;
  let text = '';

  for await (const bytes of html.content.bytes) {
    text += new TextDecoder().decode(bytes);
  }
  expect(text).toContain('Published text');
  expect(text).toContain('Published title');
  expect(text).toContain('https://new.test/');
  expect(files.find((file) => file.path === jsonLdPagePath('page-1'))?.public).toBe(false);
});
