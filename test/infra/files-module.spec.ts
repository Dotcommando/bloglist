import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import type {
  IAdminFileOperationFactory,
} from '../../src/adapters/inbound/rest/media/admin-file-operations.factory.js';
import { GET_CURRENT_ADMIN_USER } from '../../src/infra/admin-auth/admin-auth.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import {
  ADMIN_FILE_OPERATIONS, FILE_LIBRARY_OPERATIONS, FILE_LIBRARY_STORE,
  FILE_LIBRARY_USAGES,
} from '../../src/infra/media/media.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PublicHttpModule } from '../../src/infra/public-http.module.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import { SITE_REPOSITORY } from '../../src/infra/sites/sites.tokens.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import { fileLibraryFixture } from '../support/file-library.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

describe('Files composition', () => {
  it('resolves complete local operations with port overrides and validates site existence', async () => {
    const f = fileLibraryFixture();
    const sites = new FakeSiteRepository();

    sites.records.set('site-1', siteFixture());
    const module = await Test.createTestingModule({
      imports: [AppModule.forLocalOperator({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_files',
        operator: { operatorId: 'operator', platformAdministrator: true },
        media: { root: '.tmp/files-module', publicBaseUrl: '/media' },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(SITE_REPOSITORY).useValue(sites)
      .overrideProvider(FILE_LIBRARY_STORE).useValue(f.store)
      .overrideProvider(FILE_LIBRARY_USAGES).useValue(f.usages).compile();

    try {
      const operations = module.get<IFileLibraryOperations>(FILE_LIBRARY_OPERATIONS);

      for (const operation of Object.values(operations)) {
        expect(typeof operation.execute).toBe('function');
      }
      expect((await operations.list.execute({ siteId: 'site-1' })).files).toEqual([]);
      await expect(operations.list.execute({ siteId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    } finally {
      await module.close();
    }
  });

  it('uses session authorization over HTTP without binding trusted local operations', async () => {
    const f = fileLibraryFixture();
    const current = {
      execute: vi.fn(async () => {
        throw new Error('session required');
      }),
    };
    const module = await Test.createTestingModule({
      imports: [PublicHttpModule.forHttp({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_files_http',
        host: '127.0.0.1',
        port: 0,
        artifactsRoot: '.tmp/files-artifacts',
        media: { root: '.tmp/files-module', publicBaseUrl: '/media' },
        adminAuth: { origin: 'http://localhost:3000' },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(GET_CURRENT_ADMIN_USER).useValue(current)
      .overrideProvider(FILE_LIBRARY_STORE).useValue(f.store)
      .overrideProvider(FILE_LIBRARY_USAGES).useValue(f.usages).compile();

    try {
      const factory = module.get<IAdminFileOperationFactory>(ADMIN_FILE_OPERATIONS);

      await expect(factory.forSession(null).list.execute({ siteId: 'site-1' })).rejects.toThrow('session required');
      expect(() => module.get(FILE_LIBRARY_OPERATIONS)).toThrow();
      expect(current.execute).toHaveBeenCalledWith({ token: null });
    } finally {
      await module.close();
    }
  });
});
