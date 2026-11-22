import { SaveJsonLdCatalogUseCase } from '../../../src/app/use-cases/json-ld/save-json-ld-catalog.use-case.js';
import { type IJsonLdCatalog, JsonLdSourceKind } from '../../../src/domain/json-ld/json-ld-catalog.js';
import { siteFixture } from '../../support/sites.js';

describe('save JSON-LD catalog', () => {
  it('saves definitions with an optimistic version and leaves the input independent', async () => {
    const existing: IJsonLdCatalog = { siteId: 'site-1', version: 'v1', profiles: [], objects: [] };
    const save = vi.fn(async () => {});
    const useCase = new SaveJsonLdCatalogUseCase(
      { execute: async () => siteFixture() },
      { read: async () => existing, save },
      { list: async () => [{ key: 'Article' }] },
      { assertOwned: async () => {} },
      () => 'v2',
    );
    const input: Parameters<SaveJsonLdCatalogUseCase['execute']>[0] = {
      siteId: 'site-1',
      expectedVersion: 'v1',
      objects: [],
      profiles: [{
        profileId: 'article',
        name: 'Article',
        templateIds: ['Article'],
        nodes: [{
          role: 'article',
          type: 'Article',
          mappings: [{
            property: 'headline', required: true, source: { kind: JsonLdSourceKind.PageField, name: 'title' },
          }],
        }],
      }],
    };
    const result = await useCase.execute(input);

    expect(save).toHaveBeenCalledWith(result, 'v1');
    expect(result.version).toBe('v2');
    expect(result.profiles).not.toBe(input.profiles);
  });

  it('rejects stale versions, unknown templates and duplicate identifiers', async () => {
    const save = vi.fn();
    const useCase = new SaveJsonLdCatalogUseCase(
      { execute: async () => siteFixture() },
      { read: async () => ({ siteId: 'site-1', version: 'v1', profiles: [], objects: [] }), save },
      { list: async () => [] },
      { assertOwned: async () => {} },
      () => 'v2',
    );
    const profile = { profileId: 'article', name: 'Article', templateIds: ['foreign'], nodes: [] };

    await expect(useCase.execute({ siteId: 'site-1', expectedVersion: 'old', profiles: [], objects: [] }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await expect(useCase.execute({ siteId: 'site-1', expectedVersion: 'v1', profiles: [profile], objects: [] }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(useCase.execute({
      siteId: 'site-1', expectedVersion: 'v1', profiles: [profile, profile], objects: [],
    })).rejects.toMatchObject({ code: 'Validation' });
    expect(save).not.toHaveBeenCalled();
  });
});
