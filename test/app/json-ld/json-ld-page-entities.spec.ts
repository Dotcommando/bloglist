import { describe, expect, it } from 'vitest';

import { BuildJsonLdPageUseCase } from '../../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind as Source } from '../../../src/domain/json-ld/json-ld-catalog.js';
import { JsonLdRouteKind } from '../../../src/domain/json-ld/json-ld-graph.js';
import type { IBuildJsonLdPageInput } from '../../../src/ports/inbound/json-ld/build-json-ld-page.port.js';

describe('page-backed entity identities', () => {
  it('resolves a published page role and current roles without duplicate standalone records', () => {
    const input: IBuildJsonLdPageInput = {
      siteId: 's',
      pageId: 'article',
      templateId: 't',
      origin: 'https://example.test',
      pageFields: {},
      templateValues: {},
      snippetValues: {},
      bindings: [{ pageId: 'author', templateId: 'person' }],
      routes: [{ kind: JsonLdRouteKind.Page, pageId: 'author', urlId: 'author-url', path: '/author/' }],
      catalog: {
        siteId: 's',
        version: 'v',
        objects: [],
        profiles: [
          {
            profileId: 'article',
            name: 'Article',
            templateIds: ['t'],
            nodes: [
              { role: 'webpage', type: 'WebPage', mappings: [] },
              {
                role: 'article',
                type: 'Article',
                mappings: [
                  {
                    property: 'author',
                    required: true,
                    source: { kind: Source.PageEntity, pageId: 'author', role: 'person' },
                  },
                  {
                    property: 'mainEntityOfPage',
                    required: true,
                    source: { kind: Source.CurrentNode, role: 'webpage' },
                  },
                ],
              },
            ],
          },
          {
            profileId: 'person',
            name: 'Person',
            templateIds: ['person'],
            nodes: [
              { role: 'person', type: 'Person', mappings: [] },
            ],
          },
        ],
      },
    };
    const builder = new BuildJsonLdPageUseCase();
    const result = builder.execute(input)!;
    const author = result.graph['@graph'].find((node) => node['@type'] === 'Person')!;
    const article = result.graph['@graph'].find((node) => node['@type'] === 'Article')!;

    expect(author.url).toBe('https://example.test/author/');
    expect(article.author).toEqual({ '@id': author['@id'] });
    expect(() => builder.execute({ ...input, bindings: [] })).toThrow('Missing JSON-LD value');
    expect(() => builder.execute({ ...input, routes: [] })).toThrow('Missing JSON-LD value');
  });
});
