import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import {
  ADMIN_AUTH_SECRETS, ADMIN_AUTH_UNIT_OF_WORK, ADMIN_AUTH_VALUES, GET_CURRENT_ADMIN_USER,
  LIST_ADMIN_AUTH_SESSIONS, LOGIN_ADMIN_USER, LOGOUT_ADMIN_USER, REVOKE_ADMIN_AUTH_SESSION,
} from '../../src/infra/admin-auth/admin-auth.tokens.js';
import { ADMIN_PASSWORDS } from '../../src/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import {
  ADMIN_ADDRESS_REACHABILITY, CHANGE_ADMIN_ADDRESS, GET_INSTALLATION_SETTINGS, INSTALLATION_SETTINGS_STORE,
} from '../../src/infra/installation/installation.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IGetCurrentAdminUser } from '../../src/ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IListAdminAuthSessions } from '../../src/ports/inbound/admin-auth/list-admin-auth-sessions.port.js';
import type { ILoginAdminUser } from '../../src/ports/inbound/admin-auth/login-admin-user.port.js';
import type { ILogoutAdminUser } from '../../src/ports/inbound/admin-auth/logout-admin-user.port.js';
import type { IRevokeAdminAuthSession } from '../../src/ports/inbound/admin-auth/revoke-admin-auth-session.port.js';
import type {
  IChangeAdminAddress, IGetInstallationSettings,
} from '../../src/ports/inbound/installation/installation-settings.port.js';
import { authFixture, loginInput } from '../support/admin-auth.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';

describe('administrator authentication composition', () => {
  it('resolves login through its inbound token and outbound overrides', async () => {
    const f = authFixture();
    const module = await Test.createTestingModule({
      imports: [AppModule.forLocalOperator({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_admin_auth',
        operator: { operatorId: 'operator', platformAdministrator: true },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(ADMIN_AUTH_UNIT_OF_WORK).useValue(f.work)
      .overrideProvider(ADMIN_AUTH_SECRETS).useValue(f.secrets)
      .overrideProvider(ADMIN_AUTH_VALUES).useValue(f.values)
      .overrideProvider(ADMIN_PASSWORDS).useValue(f.passwords)
      .overrideProvider(INSTALLATION_SETTINGS_STORE).useValue({
        read: async () => ({ adminOrigin: 'https://old.example.com', previousOrigin: null, version: 'v1' }),
        changeAdminOrigin: async (origin: string) => ({
          adminOrigin: origin, previousOrigin: 'https://old.example.com', version: 'v2',
        }),
      })
      .overrideProvider(ADMIN_ADDRESS_REACHABILITY).useValue({ verify: async () => {} }).compile();

    try {
      const logged = await module.get<ILoginAdminUser>(LOGIN_ADMIN_USER).execute(loginInput);
      const other = await module.get<ILoginAdminUser>(LOGIN_ADMIN_USER).execute(loginInput);

      expect(await module.get<IGetInstallationSettings>(GET_INSTALLATION_SETTINGS).execute({ token: logged.token }))
        .toMatchObject({ adminOrigin: 'https://old.example.com' });
      expect(await module.get<IChangeAdminAddress>(CHANGE_ADMIN_ADDRESS).execute({
        token: logged.token, adminAddress: 'https://new.example.com/admin/', expectedVersion: 'v1',
      })).toMatchObject({ adminOrigin: 'https://new.example.com' });

      expect(await module.get<IRevokeAdminAuthSession>(REVOKE_ADMIN_AUTH_SESSION).execute({
        token: logged.token,
        sessionId: other.session.sessionId,
      })).toEqual({ currentSessionRevoked: false });
      const list = await module.get<IListAdminAuthSessions>(LIST_ADMIN_AUTH_SESSIONS).execute({ token: logged.token });

      expect(list.items).toHaveLength(1);
      const current = await module.get<IGetCurrentAdminUser>(GET_CURRENT_ADMIN_USER).execute({ token: logged.token });

      expect(current.user.adminUserId).toBe('user-1');
      await module.get<ILogoutAdminUser>(LOGOUT_ADMIN_USER).execute({ token: logged.token });
      expect(f.sessions.get(logged.session.sessionId)?.toState().revokedAt).not.toBeNull();
    } finally {
      await module.close();
    }
  });
});
