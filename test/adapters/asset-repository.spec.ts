import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import {
  assetModel,
  MongooseAssetRepository,
} from '../../src/adapters/outbound/persistence/mongoose/media/asset.repository.js';
import { UploadAssetUseCase } from '../../src/app/use-cases/media/upload-asset.use-case.js';
import { AssetVisibility } from '../../src/domain/media/asset.js';
import { binary, mediaFixture } from '../support/media.js';

describe('asset metadata persistence translation', () => {
  it('maps immutable identity to _id and rejects stale completion', async () => {
    const model = assetModel(createConnection());
    const create = vi.spyOn(model, 'create').mockRejectedValueOnce(new Error('write unavailable'));
    const f = mediaFixture();

    await new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values).execute({
      siteId: 'site',
      actorId: 'operator',
      filename: 'photo.png',
      visibility: AssetVisibility.Public,
      content: binary('x'),
    });
    const asset = f.assets[0];

    if (!asset) {
      throw new Error('fixture');
    }

    const repository = new MongooseAssetRepository(model);

    await expect(repository.create(asset)).rejects.toThrow('write unavailable');
    expect(create.mock.calls[0]?.[0]).toMatchObject({ _id: 'immutable', siteId: 'site', assetId: 'asset' });
    const query = model.updateOne({}, {});

    vi.spyOn(query, 'exec').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(model, 'updateOne').mockReturnValueOnce(query);
    await expect(repository.commitProcessing(asset, 'old')).rejects.toMatchObject({ code: 'StaleWrite' });
  });
});
