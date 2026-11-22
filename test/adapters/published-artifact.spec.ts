import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';

import {
  MongooseLegacyAssetLookupAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/publication/legacy-asset-lookup.adapter.js';
import { publicationModels } from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  FilePublishedContentAdapter,
} from '../../src/adapters/outbound/publication/files/published-content.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';

describe('public file reads and legacy asset lookup', () => {
  it('reads only manifest-public bytes and verifies their hash', async () => {
    const root = await mkdtemp(path.resolve('.tmp/public-file-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const file = artifact('assets/a.hash.css', 'text/css', 'body{color:navy}');
    const metadata = {
      path: file.path,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      checksum: file.checksum,
      public: true,
    };
    const query = models.releases.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(new models.releases({
      _id: 'release',
      siteId: 'site',
      siteKey: 'demo',
      state: ReleaseState.Ready,
      createdAt: new Date(),
      completedAt: new Date(),
      manifest: {
        routes: [], artifacts: [metadata, { ...metadata, path: 'diagnostics/private.map', public: false }],
      },
    }));
    vi.spyOn(models.releases, 'findOne').mockReturnValue(query);
    const folder = path.join(root, 'sites/demo/release/public/assets');

    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'a.hash.css'), 'body{color:navy}');

    try {
      const reader = new FilePublishedContentAdapter(root, models.releases, {
        primaryDomain: async () => 'example.test',
      });
      const result = await reader.readPublicArtifact('site', 'release', file.path);

      expect(result?.metadata).toEqual(metadata);
      expect(await reader.readPublicArtifact('site', 'release', 'diagnostics/private.map')).toBeNull();
      expect(await reader.readPublicArtifact('site', 'release', 'manifest.json')).toBeNull();
      await writeFile(path.join(folder, 'a.hash.css'), 'corrupt');
      await expect(reader.readPublicArtifact('site', 'release', file.path)).rejects.toThrow();
    } finally {
      await connection.close();

      if ((await realpath(root)).startsWith(path.resolve('.tmp') + path.sep)) {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
  it('finds a legacy path only among this site activated public artifacts', async () => {
    const connection = createConnection();
    const models = publicationModels(connection);
    const receipts = models.activations.find();

    vi.spyOn(receipts, 'exec').mockResolvedValue([new models.activations({
      _id: 'old',
      siteId:
'site',
      activatedAt: new Date(),
    })]);
    vi.spyOn(models.activations, 'find').mockReturnValue(receipts);
    const query = models.releases.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(new models.releases({ _id: 'old', siteId: 'site' }));
    const find = vi.spyOn(models.releases, 'findOne').mockReturnValue(query);

    expect(await new MongooseLegacyAssetLookupAdapter(models).findRelease('site', 'assets/old.hash.js')).toBe('old');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      siteId: 'site',
      _id: 'old',
      'manifest.artifacts': { $elemMatch: { path: 'assets/old.hash.js', public: true } },
    }));
    await connection.close();
  });
});
