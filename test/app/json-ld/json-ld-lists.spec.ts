import { describe, expect, it } from 'vitest';

import { BuildJsonLdPageUseCase } from '../../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind } from '../../../src/domain/json-ld/json-ld-catalog.js';

describe('JSON-LD typed lists', () => {
  it('keeps prepared scalar lists as JSON arrays, rather than joined text', () => {
    const graph = new BuildJsonLdPageUseCase().execute({
      siteId: 's',
      pageId: 'p',
      templateId: 't',
      origin: 'https://example.test',
      routes: [],
      pageFields: {},
      templateValues: {},
      snippetValues: { identities: ['https://example.org/alice', 'https://example.net/alice'] },
      catalog: {
        siteId: 's',
        version: 'v',
        objects: [],
        profiles: [{
          profileId: 'profile',
          name: 'Person',
          templateIds: ['t'],
          nodes: [{
            role: 'person',
            type: 'Person',
            mappings: [{
              property: 'sameAs',
              required: true,
              source: { kind: JsonLdSourceKind.Snippet, name: 'identities' },
            }],
          }],
        }],
      },
    });

    expect(graph?.graph['@graph'][0]?.sameAs).toEqual(['https://example.org/alice', 'https://example.net/alice']);
  });
});
