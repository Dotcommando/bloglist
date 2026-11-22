import { BuildJsonLdPageUseCase } from '../../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind } from '../../../src/domain/json-ld/json-ld-catalog.js';
import { JsonLdValueKind } from '../../../src/domain/json-ld/json-ld-graph.js';
import { BusinessError } from '../../../src/domain/shared/business-error.js';

it('resolves assigned profiles from prepared page and snippet values without executing loaders', () => {
  const catalog = {
    siteId: 'site-1',
    version: 'v1',
    profiles: [{
      profileId: 'article',
      name: 'Article',
      templateIds: ['Article'],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [
          {
            property: 'headline', required: true, source: { kind: JsonLdSourceKind.PageField as const, name: 'title' },
          },
          {
            property: 'description',
            required: true,
            source: { kind: JsonLdSourceKind.Snippet as const, name: 'summary' },
          },
          {
            property: 'author',
            required: true,
            source: { kind: JsonLdSourceKind.SharedObject as const, objectId: 'alice' },
          },
        ],
      }],
    }],
    objects: [{
      objectId: 'alice',
      name: 'Alice',
      type: 'Person' as const,
      properties: { name: { kind: JsonLdValueKind.Text as const, value: 'Alice' } },
    }],
  };
  const result = new BuildJsonLdPageUseCase().execute({
    catalog,
    siteId: 'site-1',
    pageId: 'page-1',
    origin: 'https://example.test',
    templateId: 'Article',
    pageFields: { title: 'Published title' },
    templateValues: {},
    snippetValues: { summary: 'Prepared summary' },
    routes: [],
  });

  expect(result?.graph['@graph']).toHaveLength(2);
  expect(result?.graph['@graph'][0]).toMatchObject({
    '@type': 'Article', headline: 'Published title', description: 'Prepared summary',
  });
  expect(result?.graph['@graph'][1]).toMatchObject({ '@type': 'Person', name: 'Alice' });
  expect(() => new BuildJsonLdPageUseCase().validateDeferred({
    catalog,
    siteId: 'site-1',
    pageId: 'page-1',
    origin: 'https://example.test',
    templateId: 'Article',
    pageFields: { title: 'Title' },
    templateValues: {},
    snippetValues: {},
    routes: [],
  })).not.toThrow();
  expect(() => new BuildJsonLdPageUseCase().validateDeferred({
    catalog: { ...catalog, objects: [] },
    siteId: 'site-1',
    pageId: 'page-1',
    origin: 'https://example.test',
    templateId: 'Article',
    pageFields: { title: 'Title' },
    templateValues: {},
    snippetValues: {},
    routes: [],
  })).toThrow(BusinessError);
  expect(() => new BuildJsonLdPageUseCase().execute({
    catalog,
    siteId: 'site-1',
    pageId: 'page-1',
    origin: 'https://example.test',
    templateId: 'Article',
    pageFields: {},
    templateValues: {},
    snippetValues: { summary: 'Prepared summary' },
    routes: [],
  })).toThrow('article.headline');
  expect(() => new BuildJsonLdPageUseCase().execute({
    catalog: { ...catalog, objects: [] },
    siteId: 'site-1',
    pageId: 'page-1',
    origin: 'https://example.test',
    templateId: 'Article',
    pageFields: { title: 'Title' },
    templateValues: {},
    snippetValues: { summary: 'Summary' },
    routes: [],
  })).toThrow(BusinessError);
});

it('resolves the editor description field and preserves explicit values and required checks', () => {
  const input = {
    siteId: 'site-1',
    pageId: 'page-1',
    origin: 'https://example.test',
    templateId: 'Page',
    catalog: {
      siteId: 'site-1',
      version: 'v1',
      profiles: [{
        profileId: 'webpage',
        name: 'WebPage',
        templateIds: ['Page'],
        nodes: [{
          role: 'webpage',
          type: 'WebPage',
          mappings: [{
            property: 'description',
            required: true,
            source: { kind: JsonLdSourceKind.PageField as const, name: 'description' },
          }],
        }],
      }],
      objects: [],
    },
    pageFields: { metaDescription: 'Existing page metadata' },
    templateValues: {},
    snippetValues: {},
    routes: [],
  };
  const operation = new BuildJsonLdPageUseCase();

  expect(operation.execute(input)?.graph['@graph'][0]).toMatchObject({
    description: 'Existing page metadata',
  });
  expect(() => operation.validateDeferred(input)).not.toThrow();
  expect(operation.execute({
    ...input, pageFields: { ...input.pageFields, description: 'Explicit prepared description' },
  })?.graph['@graph'][0]).toMatchObject({ description: 'Explicit prepared description' });
  expect(() => operation.execute({ ...input, pageFields: { metaDescription: '' } }))
    .toThrow('webpage.description');
  expect(() => operation.execute({ ...input, pageFields: {} })).toThrow('webpage.description');
  input.catalog.profiles[0]!.nodes[0]!.mappings[0]!.required = false;

  expect(operation.execute({ ...input, pageFields: {} })?.graph['@graph'][0]).not.toHaveProperty('description');
});
