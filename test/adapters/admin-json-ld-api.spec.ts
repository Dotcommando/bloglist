import { describe, expect, it } from 'vitest';

import { readJsonLdCatalog } from '../../admin/src/features/json-ld/json-ld-api.js';

describe('JSON-LD administration response boundary', () => {
  it('keeps typed values, distinct reference modes and assignments', () => {
    const catalog = {
      siteId: 's',
      version: 'v',
      profiles: [{
        profileId: 'p',
        name: 'Article',
        templateIds: ['t'],
        nodes: [{
          role: 'article',
          type: 'Article',
          keySource: { kind: 'snippet', name: 'nearest', path: ['sessionId'] },
          presenceSource: { kind: 'snippet', name: 'nearest', path: ['present'] },
          mappings: [{
            property: 'url',
            required: true,
            source: { kind: 'exactUrl', pageId: 'page', urlId: 'address' },
          }],
        }],
      }],
      objects: [{
        objectId: 'o',
        name: 'Person',
        type: 'Person',
        properties: { name: { kind: 'text', value: 'Alice' } },
      }],
    };

    expect(readJsonLdCatalog(catalog, 's')).toEqual(catalog);
    expect(() => readJsonLdCatalog(catalog, 'foreign')).toThrow('Foreign');
    expect(() => readJsonLdCatalog({ ...catalog, profiles: [{}] }, 's')).toThrow();
  });
});
