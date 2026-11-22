import {
  JsonLdPublicationSourceService,
} from '../../../src/app/services/json-ld/json-ld-publication-source.service.js';
import { JsonLdSourceKind } from '../../../src/domain/json-ld/json-ld-catalog.js';
import { source } from '../../support/publication.js';

it('keeps unused profiles from requiring a public origin for ordinary HTML publication', async () => {
  const snapshot = source('Published');
  const service = new JsonLdPublicationSourceService({ capture: async () => snapshot }, {
    read: async () => ({
      siteId: snapshot.siteId,
      version: 'v1',
      profiles: [{
        profileId: 'unassigned',
        name: 'Unassigned',
        templateIds: [],
        nodes: [{
          role: 'article',
          type: 'Article',
          mappings: [{
            property: 'headline',
            required: true,
            source: { kind: JsonLdSourceKind.PageField, name: 'title' },
          }],
        }],
      }],
      objects: [],
    }),
  }, { readActive: async () => null });

  await expect(service.capture(snapshot.siteId)).resolves.toEqual(snapshot);
});

it('captures the catalog once alongside published page data and rejects foreign catalog ownership', async () => {
  const snapshot = { ...source('Published'), publicOrigin: 'https://example.test' };
  const read = vi.fn(async () => ({ siteId: snapshot.siteId, version: 'v1', profiles: [], objects: [] }));
  const service = new JsonLdPublicationSourceService({ capture: async () => snapshot }, { read },
    { readActive: async () => null });
  const result = await service.capture(snapshot.siteId);

  expect(result.jsonLd?.catalog.version).toBe('v1');
  expect(result.jsonLd?.origin).toBe('https://example.test');
  expect(read).toHaveBeenCalledOnce();
  read.mockResolvedValue({ siteId: 'foreign', version: 'v1', profiles: [], objects: [] });
  await expect(service.capture(snapshot.siteId)).rejects.toThrow('Foreign JSON-LD catalog');
});
