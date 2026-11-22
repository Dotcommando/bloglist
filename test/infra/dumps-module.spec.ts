import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AppModule } from '../../src/infra/app.module.js';
import {
  CREATE_SITE_DUMP, DELETE_SITE_DUMP, GET_DUMP_EXPORT_ITEMS, GET_SITE_DUMP, IMPORT_SITE_DUMP, INSPECT_SITE_DUMP,
  LIST_SITE_DUMPS,
  RESTORE_SITE_DUMP, SITE_DUMP_STORE,
} from '../../src/infra/dumps/dumps.tokens.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import { SITE_REPOSITORY } from '../../src/infra/sites/sites.tokens.js';
import type { IListSiteDumps } from '../../src/ports/inbound/dumps/site-dumps.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

describe('site dump composition', () => {
  it('resolves all local use cases and checks trusted actor and site before accessing files', async () => {
    const sites = new FakeSiteRepository();
    const store = { list: vi.fn(async () => []) };

    sites.records.set('site-1', siteFixture());
    const module = await Test.createTestingModule({
      imports: [AppModule.forLocalOperator({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_dumps',
        operator: { operatorId: 'operator', platformAdministrator: true },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(SITE_REPOSITORY).useValue(sites)
      .overrideProvider(SITE_DUMP_STORE).useValue(store).compile();

    try {
      for (const token of [CREATE_SITE_DUMP, GET_SITE_DUMP, IMPORT_SITE_DUMP, LIST_SITE_DUMPS, RESTORE_SITE_DUMP,
        DELETE_SITE_DUMP, GET_DUMP_EXPORT_ITEMS, INSPECT_SITE_DUMP]) {
        expect(typeof module.get<{ execute: unknown }>(token).execute).toBe('function');
      }
      const list = module.get<IListSiteDumps>(LIST_SITE_DUMPS);

      await expect(list.execute({ siteId: 'site-1', actorId: 'operator' })).resolves.toEqual([]);
      await expect(list.execute({ siteId: 'site-1', actorId: 'other' })).rejects.toMatchObject({ code: 'Forbidden' });
      await expect(list.execute({ siteId: 'missing', actorId: 'operator' }))
        .rejects.toMatchObject({ code: 'NotFound' });
      expect(store.list).toHaveBeenCalledTimes(1);
    } finally {
      await module.close();
    }
  });
});
