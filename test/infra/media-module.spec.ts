import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AssetVisibility } from '../../src/domain/media/asset.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import {
  ASSET_ACCESS,
  ASSET_INSPECTION,
  ASSET_REPOSITORY,
  ASSET_STORAGE,
  ASSET_VALUES,
  UPLOAD_ASSET,
} from '../../src/infra/media/media.tokens.js';
import { GET_ASSET, PROCESS_ASSET } from '../../src/infra/media/media.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IGetAsset } from '../../src/ports/inbound/media/get-asset.port.js';
import type { IProcessAsset } from '../../src/ports/inbound/media/process-asset.port.js';
import type { IUploadAsset } from '../../src/ports/inbound/media/upload-asset.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { binary, mediaFixture } from '../support/media.js';

describe('media operation composition', () => {
  it('resolves UploadAsset through its token with deterministic outbound overrides', async () => {
    const f = mediaFixture();
    const module = await Test.createTestingModule({
      imports: [AppModule.forLocalOperator({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_media',
        operator: { operatorId: 'operator', platformAdministrator: true },
        media: { root: '.tmp/unit-media', publicBaseUrl: '/media' },
      })],
    })
      .overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(ASSET_REPOSITORY).useValue(f.repository)
      .overrideProvider(ASSET_STORAGE).useValue(f.storage)
      .overrideProvider(ASSET_ACCESS).useValue(f.access)
      .overrideProvider(ASSET_VALUES).useValue(f.values)
      .overrideProvider(ASSET_INSPECTION).useValue(f.inspection)
      .compile();

    try {
      expect(await module.get<IUploadAsset>(UPLOAD_ASSET).execute({
        siteId: 'site',
        actorId: 'operator',
        filename: 'photo.png',
        visibility: AssetVisibility.Public,
        content: binary('x'),
      }))
        .toMatchObject({ state: 'Processing' });
      expect((await module.get<IGetAsset>(GET_ASSET).execute({
        siteId: 'site',
        actorId: 'operator',
        assetId: 'asset',
        assetVersion: 'immutable',
      }))?.toState().version).toBe('v1');
      expect(typeof module.get<IProcessAsset>(PROCESS_ASSET).execute).toBe('function');
    } finally {
      await module.close();
    }
  });
});
