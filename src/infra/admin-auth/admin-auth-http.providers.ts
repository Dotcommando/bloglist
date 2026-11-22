import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import {
  AdminAuthController, type IAdminAuthHttpSettings,
} from '../../adapters/inbound/rest/admin-auth/admin-auth.controller.js';
import {
  AdminSiteAuthorizationController,
} from '../../adapters/inbound/rest/authorization/admin-site-authorization.controller.js';
import {
  MongooseAdminUserStore,
} from '../../adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import {
  MongooseSiteAuthorizationStore,
} from '../../adapters/outbound/persistence/mongoose/authorization/site-authorization-store.adapter.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { SiteAuthorizationUseCase } from '../../app/use-cases/authorization/site-authorization.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IListAdminAuthSessions } from '../../ports/inbound/admin-auth/list-admin-auth-sessions.port.js';
import type { ILoginAdminUser } from '../../ports/inbound/admin-auth/login-admin-user.port.js';
import type { ILogoutAdminUser } from '../../ports/inbound/admin-auth/logout-admin-user.port.js';
import type { IRevokeAdminAuthSession } from '../../ports/inbound/admin-auth/revoke-admin-auth-session.port.js';
import {
  type ISiteAuthorization, SITE_AUTHORIZATION,
} from '../../ports/inbound/authorization/site-authorization.port.js';
import { ADMIN_PASSWORDS, ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { adminAuthProviders } from './admin-auth.providers.js';
import {
  GET_CURRENT_ADMIN_USER, LIST_ADMIN_AUTH_SESSIONS, LOGIN_ADMIN_USER, LOGOUT_ADMIN_USER, REVOKE_ADMIN_AUTH_SESSION,
} from './admin-auth.tokens.js';

export function adminAuthHttpProviders(settings: IAdminAuthHttpSettings): Provider[] {
  return [
    {
      provide: ADMIN_USER_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseAdminUserStore(connection),
    },
    { provide: ADMIN_PASSWORDS, useFactory: () => new ScryptAdminPasswordAdapter() },
    ...adminAuthProviders(),
    {
      provide: SITE_AUTHORIZATION,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new SiteAuthorizationUseCase(new MongooseSiteAuthorizationStore(connection)),
    },
    {
      provide: AdminSiteAuthorizationController,
      inject: [GET_CURRENT_ADMIN_USER, SITE_AUTHORIZATION],
      useFactory: (current: IGetCurrentAdminUser, operations: ISiteAuthorization) =>
        new AdminSiteAuthorizationController(settings, current, operations),
    },
    {
      provide: AdminAuthController,
      inject: [LOGIN_ADMIN_USER, LOGOUT_ADMIN_USER, GET_CURRENT_ADMIN_USER,
        LIST_ADMIN_AUTH_SESSIONS, REVOKE_ADMIN_AUTH_SESSION],
      useFactory: (login: ILoginAdminUser, logout: ILogoutAdminUser, current: IGetCurrentAdminUser,
        sessions: IListAdminAuthSessions, revoke: IRevokeAdminAuthSession) =>
        new AdminAuthController(settings, login, logout, current, sessions, revoke),
    },
  ];
}
