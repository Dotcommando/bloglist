import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import {
  ASSET_ACCESS, ASSET_INSPECTION, SITE_FAVICON_OPERATIONS, SITE_FAVICON_STORE,
} from '../../src/infra/media/media.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PUBLISH_MEDIA_ADDRESS_RELEASE } from '../../src/infra/publication/publication.tokens.js';
import type { ISiteFaviconOperations } from '../../src/ports/inbound/media/site-favicon.port.js';

it('resolves site favicon operations through AppModule with explicit fake outbound providers', async () => {
  const connection = createConnection();
  const read = vi.fn(async () => null);
  const requireProcessing = vi.fn(async () => {});
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'synthetic_favicon',
      media: { root: '.tmp/synthetic-favicon-composition', publicBaseUrl: '/assets' },
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(MONGO_CONNECTION).useValue(connection)
    .overrideProvider(HOOK_PERSISTENCE).useValue({ connection })
    .overrideProvider(HOOK_CONFIGURATION).useValue({})
    .overrideProvider(PUBLISH_MEDIA_ADDRESS_RELEASE).useValue({ execute: vi.fn(async () => null) })
    .overrideProvider(SITE_FAVICON_STORE).useValue({ read, replace: vi.fn(), remove: vi.fn(async () => {}) })
    .overrideProvider(ASSET_ACCESS).useValue({ requireProcessing })
    .overrideProvider(ASSET_INSPECTION).useValue({ inspect: vi.fn() })
    .compile();

  try {
    const operations = module.get<ISiteFaviconOperations>(SITE_FAVICON_OPERATIONS);

    expect(await operations.get.execute({ siteId: 'site-1' })).toBeNull();
    expect(requireProcessing).toHaveBeenCalledWith('site-1');
    expect(read).toHaveBeenCalledWith('site-1');
    await operations.delete.execute({ siteId: 'site-1' });
  } finally {
    await module.close();
  }
});
