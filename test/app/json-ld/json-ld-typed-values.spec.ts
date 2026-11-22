import { BuildJsonLdPageUseCase } from '../../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { type IJsonLdCatalog, JsonLdSourceKind } from '../../../src/domain/json-ld/json-ld-catalog.js';

it('uses public prepared media, typed snippet properties and UTC publication instants', () => {
  const catalog: IJsonLdCatalog = {
    siteId: 'site-1',
    version: 'v1',
    objects: [],
    profiles: [{
      profileId: 'article',
      name: 'Article',
      templateIds: ['Article'],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [
          { property: 'image', required: true, source: { kind: JsonLdSourceKind.TemplateVariable, name: 'cover' } },
          {
            property: 'datePublished',
            required: true,
            source: { kind: JsonLdSourceKind.PageField, name: 'createdAt' },
          },
          {
            property: 'wordCount',
            required: true,
            source: { kind: JsonLdSourceKind.Snippet, name: 'summary', path: ['wordCount'] },
          },
        ],
      }],
    }],
  };
  const graph = new BuildJsonLdPageUseCase().execute({
    catalog,
    siteId: 'site-1',
    pageId: 'page-1',
    templateId: 'Article',
    origin: 'https://example.test',
    routes: [],
    pageFields: { createdAt: new Date('2026-11-02T13:00:00Z') },
    templateValues: { cover: { exists: true, src: '/assets/public/image.webp', alt: 'Public image' } },
    snippetValues: { summary: { wordCount: 123 } },
  });

  expect(graph?.graph['@graph'][0]).toMatchObject({
    image: 'https://example.test/assets/public/image.webp', datePublished: '2026-11-02T13:00:00.000Z', wordCount: 123,
  });
});
