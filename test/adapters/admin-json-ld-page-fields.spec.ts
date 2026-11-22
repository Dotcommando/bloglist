import { JSON_LD_PAGE_FIELDS } from '../../admin/src/features/json-ld/json-ld-page-fields.js';
import { BuildJsonLdPageUseCase } from '../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind } from '../../src/domain/json-ld/json-ld-catalog.js';
import { pageFixture } from '../support/pages.js';

it.each(JSON_LD_PAGE_FIELDS)('offers a real page field %s that the JSON-LD builder can resolve', (name) => {
  const page = {
    ...pageFixture().toState(),
    title: 'Page title',
    h1: 'Page heading',
    metaTitle: 'SEO title',
    metaDescription: 'SEO description',
  };

  expect(Object.hasOwn(page, name)).toBe(true);
  const result = new BuildJsonLdPageUseCase().execute({
    siteId: page.siteId,
    pageId: page.pageId,
    origin: 'https://example.test',
    templateId: 'Page',
    catalog: {
      siteId: page.siteId,
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
            source: { kind: JsonLdSourceKind.PageField, name },
          }],
        }],
      }],
      objects: [],
    },
    pageFields: page,
    templateValues: {},
    snippetValues: {},
    routes: [],
  });
  const value = page[name];

  expect(result?.graph['@graph'][0]?.description).toBe(value instanceof Date ? value.toISOString() : value);
});
