import { JsonLdReferenceOwnershipService } from '../../src/app/services/json-ld/json-ld-reference-ownership.service.js';
import { type IJsonLdCatalog, JsonLdSourceKind } from '../../src/domain/json-ld/json-ld-catalog.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { urlFixture } from '../support/routing.js';

describe('JSON-LD reference ownership', () => {
  const previous: IJsonLdCatalog = { siteId: 'site-1', version: 'v1', profiles: [], objects: [] };
  const catalog: IJsonLdCatalog = {
    ...previous,
    profiles: [{
      profileId: 'article',
      name: 'Article',
      templateIds: [],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [{
          property: 'url', required: true, source: { kind: JsonLdSourceKind.Page, pageId: 'page-1' },
        }],
      }],
    }],
  };

  it('checks that a newly selected page belongs to the site', async () => {
    const source = { execute: vi.fn(async () => ({ siteId: 'site-1', urls: [], pages: [], published: null })) };
    const checker = new JsonLdReferenceOwnershipService(source);

    await expect(checker.assertOwned(catalog, previous)).rejects.toMatchObject({ code: 'NotFound' });
    expect(source.execute).toHaveBeenCalledWith({ siteId: 'site-1' });
  });

  it('rejects a newly selected exact URL belonging to a different page', async () => {
    const changed = structuredClone(catalog);
    const next: IJsonLdCatalog = {
      ...changed,
      profiles: [{
        ...changed.profiles[0]!,
        nodes: [{
          ...changed.profiles[0]!.nodes[0]!,
          mappings: [{
            property: 'url',
            required: true,
            source: { kind: JsonLdSourceKind.ExactUrl, pageId: 'page-1', urlId: 'url-old' },
          }],
        }],
      }],
    };
    const source = {
      execute: async () => ({
        siteId: 'site-1',
        published: null,
        pages: [{ pageId: 'page-1', title: 'Page', language: 'en', status: PageStatus.PUBLISHED, robotsIndex: true }],
        urls: [{ url: urlFixture({ pageId: 'page-2' }).toState(), version: 'v1' }],
      }),
    };

    await expect(new JsonLdReferenceOwnershipService(source).assertOwned(next, previous))
      .rejects.toMatchObject({ code: 'NotFound' });
  });

  it('allows an already saved reference to remain after its target was deleted', async () => {
    const source = { execute: async () => ({ siteId: 'site-1', urls: [], pages: [], published: null }) };

    await expect(new JsonLdReferenceOwnershipService(source).assertOwned(catalog, catalog)).resolves.toBeUndefined();
  });
});
