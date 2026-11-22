import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import {
  ADMIN_USER_ACCESS,
  ADMIN_USER_READER,
  CREATE_ADMIN_USER_FROM_CONSOLE,
  GET_ADMIN_USER,
} from '../../src/infra/admin-users/admin-users.tokens.js';
import {
  ADMIN_PASSWORDS,
  ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_VALUES, UPDATE_ADMIN_USER,
} from '../../src/infra/admin-users/admin-users.tokens.js';
import { BLOCK_ADMIN_USER } from '../../src/infra/admin-users/admin-users.tokens.js';
import { DELETE_ADMIN_USER } from '../../src/infra/admin-users/admin-users.tokens.js';
import { LIST_ADMIN_USERS } from '../../src/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IBlockAdminUser } from '../../src/ports/inbound/admin-users/block-admin-user.port.js';
import type {
  ICreateAdminUserFromConsole,
} from '../../src/ports/inbound/admin-users/create-admin-user-from-console.port.js';
import type { IDeleteAdminUser } from '../../src/ports/inbound/admin-users/delete-admin-user.port.js';
import type { IGetAdminUser } from '../../src/ports/inbound/admin-users/get-admin-user.port.js';
import type { IListAdminUsers } from '../../src/ports/inbound/admin-users/list-admin-users.port.js';
import type { IUpdateAdminUser } from '../../src/ports/inbound/admin-users/update-admin-user.port.js';
import { adminFixture } from '../support/admin-users.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';

describe('administrator operation composition', () => {
  it('resolves creation only in explicitly requested console composition', async () => {
    const f = adminFixture(0);
    const module = await Test.createTestingModule({
      imports: [AppModule.forAdminUserCreation({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_admin_users',
        operator: { operatorId: 'operator', platformAdministrator: true },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(ADMIN_USER_UNIT_OF_WORK).useValue(f.unitOfWork)
      .overrideProvider(ADMIN_USER_ACCESS).useValue(f.access)
      .overrideProvider(ADMIN_PASSWORDS).useValue(f.passwords)
      .overrideProvider(ADMIN_USER_VALUES).useValue(f.values).compile();

    try {
      const user = await module.get<ICreateAdminUserFromConsole>(CREATE_ADMIN_USER_FROM_CONSOLE).execute({
        actorId: 'operator', email: 'console@example.test', password: 'synthetic initial password',
      });

      expect(user).toMatchObject({ email: 'console@example.test', allowedSiteIds: [], blocked: false });
    } finally {
      await module.close();
    }
  });
  it('resolves safe reading with fake outbound ports and omits console creation', async () => {
    const f = adminFixture();
    const module = await Test.createTestingModule({
      imports: [AppModule.forLocalOperator({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_admin_users',
        operator: { operatorId: 'operator', platformAdministrator: true },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(ADMIN_USER_READER).useValue(f.reader)
      .overrideProvider(ADMIN_USER_UNIT_OF_WORK).useValue(f.unitOfWork)
      .overrideProvider(ADMIN_PASSWORDS).useValue(f.passwords)
      .overrideProvider(ADMIN_USER_VALUES).useValue(f.values)
      .overrideProvider(ADMIN_USER_ACCESS).useValue(f.access).compile();

    try {
      expect((await module.get<IGetAdminUser>(GET_ADMIN_USER).execute({
        actorId: 'operator', adminUserId: 'user-1',
      }))?.email)
        .toBe('user-1@example.test');
      expect(() => module.get(CREATE_ADMIN_USER_FROM_CONSOLE)).toThrow();
      expect((await module.get<IUpdateAdminUser>(UPDATE_ADMIN_USER).execute({
        actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1', email: 'updated@example.test',
      })).email).toBe('updated@example.test');
      const blocked = await module.get<IBlockAdminUser>(BLOCK_ADMIN_USER).execute({
        actorId: 'operator', adminUserId: 'user-2', expectedVersion: 'user-2-v1', blocked: true,
      });

      expect(blocked.blocked).toBe(true);
      expect((await module.get<IDeleteAdminUser>(DELETE_ADMIN_USER).execute({
        actorId: 'operator', adminUserId: 'user-2', expectedVersion: blocked.version,
      })).adminUserId).toBe('user-2');
      expect((await module.get<IListAdminUsers>(LIST_ADMIN_USERS).execute({ actorId: 'operator' })).items)
        .toHaveLength(1);
    } finally {
      await module.close();
    }
  });
});
