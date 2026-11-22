import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AppModule } from '../../src/infra/app.module.js';
import {
  GET_PAGE_RESOLUTION_STATISTICS, PAGE_RESOLUTION_STORE, RECORD_PAGE_RESOLUTION,
} from '../../src/infra/diagnostics/diagnostics.tokens.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { GET_SITE, SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type {
  IGetPageResolutionStatistics,
} from '../../src/ports/inbound/diagnostics/get-page-resolution-statistics.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { siteFixture } from '../support/sites.js';

it('resolves diagnostic inbound operations through AppModule with outbound overrides', async () => {
  const statistics = vi.fn().mockResolvedValue({ rows: [], versions: [] });
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_diagnostics',
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
    .overrideProvider(PAGE_RESOLUTION_STORE).useValue({ append: vi.fn(), statistics })
    .overrideProvider(GET_SITE).useValue({ execute: async () => siteFixture() }).compile();

  try {
    expect(module.get(RECORD_PAGE_RESOLUTION)).toBeDefined();
    await module.get<IGetPageResolutionStatistics>(GET_PAGE_RESOLUTION_STATISTICS).execute({ siteId: 'site-1' });
    expect(statistics).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-1' }));
  } finally {
    await module.close();
  }
});
