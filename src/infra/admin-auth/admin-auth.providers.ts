import type { Provider } from '@nestjs/common';

import type {
  MongooseAdminUserStore,
} from '../../adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import {
  AdminAuthSecretsAdapter, AdminAuthValuesAdapter,
} from '../../adapters/outbound/security/admin-auth/admin-auth-values.adapter.js';
import { AdminAuthContextService } from '../../app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import { ListAdminAuthSessionsUseCase } from '../../app/use-cases/admin-auth/list-admin-auth-sessions.use-case.js';
import { LoginAdminUserUseCase } from '../../app/use-cases/admin-auth/login-admin-user.use-case.js';
import { LogoutAdminUserUseCase } from '../../app/use-cases/admin-auth/logout-admin-user.use-case.js';
import {
  RevokeAdminAuthSessionUseCase,
} from '../../app/use-cases/admin-auth/revoke-admin-auth-session.use-case.js';
import type { IAdminAuthUnitOfWorkPort } from '../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type {
  IAdminAuthSecretsPort, IAdminAuthValuesPort,
} from '../../ports/outbound/admin-auth/admin-auth-values.port.js';
import type { IAdminPasswordPort } from '../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import { ADMIN_PASSWORDS, ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import {
  ADMIN_AUTH_CONTEXT, ADMIN_AUTH_SECRETS, ADMIN_AUTH_UNIT_OF_WORK, ADMIN_AUTH_VALUES,
  GET_CURRENT_ADMIN_USER, LIST_ADMIN_AUTH_SESSIONS, LOGIN_ADMIN_USER, LOGOUT_ADMIN_USER, REVOKE_ADMIN_AUTH_SESSION,
} from './admin-auth.tokens.js';

export function adminAuthProviders(): Provider[] {
  return [
    {
      provide: REVOKE_ADMIN_AUTH_SESSION,
      inject: [ADMIN_AUTH_UNIT_OF_WORK, ADMIN_AUTH_CONTEXT, ADMIN_AUTH_VALUES],
      useFactory: (work: IAdminAuthUnitOfWorkPort, context: AdminAuthContextService, values: IAdminAuthValuesPort) =>
        new RevokeAdminAuthSessionUseCase(work, context, values),
    },
    {
      provide: LIST_ADMIN_AUTH_SESSIONS,
      inject: [ADMIN_AUTH_UNIT_OF_WORK, ADMIN_AUTH_CONTEXT, ADMIN_AUTH_VALUES],
      useFactory: (work: IAdminAuthUnitOfWorkPort, context: AdminAuthContextService, values: IAdminAuthValuesPort) =>
        new ListAdminAuthSessionsUseCase(work, context, values),
    },
    {
      provide: ADMIN_AUTH_CONTEXT,
      inject: [ADMIN_AUTH_SECRETS],
      useFactory: (secrets: IAdminAuthSecretsPort) => new AdminAuthContextService(secrets),
    },
    {
      provide: GET_CURRENT_ADMIN_USER,
      inject: [ADMIN_AUTH_UNIT_OF_WORK, ADMIN_AUTH_CONTEXT, ADMIN_AUTH_VALUES],
      useFactory: (work: IAdminAuthUnitOfWorkPort, context: AdminAuthContextService, values: IAdminAuthValuesPort) =>
        new GetCurrentAdminUserUseCase(work, context, values),
    },
    {
      provide: LOGOUT_ADMIN_USER,
      inject: [ADMIN_AUTH_UNIT_OF_WORK, ADMIN_AUTH_SECRETS, ADMIN_AUTH_VALUES],
      useFactory: (work: IAdminAuthUnitOfWorkPort, secrets: IAdminAuthSecretsPort, values: IAdminAuthValuesPort) =>
        new LogoutAdminUserUseCase(work, secrets, values),
    },
    {
      provide: ADMIN_AUTH_UNIT_OF_WORK,
      inject: [ADMIN_USER_STORE],
      useFactory: (store: MongooseAdminUserStore): IAdminAuthUnitOfWorkPort => ({ run: (work) => store.runAuth(work) }),
    },
    { provide: ADMIN_AUTH_SECRETS, useFactory: () => new AdminAuthSecretsAdapter() },
    { provide: ADMIN_AUTH_VALUES, useFactory: () => new AdminAuthValuesAdapter() },
    {
      provide: LOGIN_ADMIN_USER,
      inject: [ADMIN_AUTH_UNIT_OF_WORK, ADMIN_PASSWORDS, ADMIN_AUTH_SECRETS, ADMIN_AUTH_VALUES],
      useFactory: (work: IAdminAuthUnitOfWorkPort, passwords: IAdminPasswordPort,
        secrets: IAdminAuthSecretsPort, values: IAdminAuthValuesPort) =>
        new LoginAdminUserUseCase(work, passwords, secrets, values),
    },
  ];
}
