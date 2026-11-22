import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AdminAddonInstallationsController }
  from '../../src/adapters/inbound/rest/addons/admin-addon-installations.controller.js';
import { AdminAddonsController } from '../../src/adapters/inbound/rest/addons/admin-addons.controller.js';
import {
  ADDON_ACCESS, ENABLE_SITE_ADDON, LIST_SITE_ADDONS, SITE_ADDON_STORE,
} from '../../src/infra/addons/addons.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PublicHttpModule } from '../../src/infra/public-http.module.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IEnableSiteAddon } from '../../src/ports/inbound/addons/enable-site-addon.port.js';
import type { IListSiteAddons } from '../../src/ports/inbound/addons/list-site-addons.port.js';
import type { ISiteAddonStorePort } from '../../src/ports/outbound/addons/site-addon-store.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';

describe('clean add-on composition', () => {
  it('resolves generic operations with an empty registry and no optional integration', async () => {
    const store: ISiteAddonStorePort = {
      listEnabled: async () => [],
      find: async () => null,
      list: async () => [],
      commit: async (next) => next,
    };
    const module = await Test.createTestingModule({
      imports: [AppModule.forLocalOperator({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_addons',
        dumpsRoot: '.tmp/unit-addons-' + randomUUID(),
        operator: { operatorId: 'operator', platformAdministrator: true },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(SITE_ADDON_STORE).useValue(store)
      .overrideProvider(ADDON_ACCESS).useValue({ requireAdministrator: async () => {} }).compile();

    try {
      expect(await module.get<IListSiteAddons>(LIST_SITE_ADDONS).execute({ siteId: 'site', actorId: 'operator' }))
        .toEqual([]);
      await expect(module.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
        siteId: 'site',
        actorId: 'operator',
        addonKey: 'unknown',
        expectedVersion: null,
        configuration: { schemaVersion: 1, values: {} },
      })).rejects.toMatchObject({ code: 'NotFound' });
    } finally {
      await module.close();
    }
  });

  it('resolves authenticated HTTP management without installing an add-on', async () => {
    const module = await Test.createTestingModule({
      imports: [PublicHttpModule.forHttp({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_addons_http',
        dumpsRoot: '.tmp/unit-addons-http-' + randomUUID(),
        host: '127.0.0.1',
        port: 0,
        artifactsRoot: '.tmp/unit-addon-artifacts',
        adminAuth: { origin: 'http://localhost:3000' },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection()).compile();

    try {
      expect(module.get(AdminAddonsController)).toBeInstanceOf(AdminAddonsController);
      expect(module.get(AdminAddonInstallationsController)).toBeInstanceOf(AdminAddonInstallationsController);
    } finally {
      await module.close();
    }
  });
});
