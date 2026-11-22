import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';

import type {
  IAdminUserOperationFactory,
} from '../../adapters/inbound/rest/admin-users/admin-user-operations.factory.js';
import { AdminUsersController } from '../../adapters/inbound/rest/admin-users/admin-users.controller.js';
import {
  SessionAdminUserAccessAdapter,
} from '../../adapters/outbound/access/admin-users/session-admin-user-access.adapter.js';
import { BlockAdminUserUseCase } from '../../app/use-cases/admin-users/block-admin-user.use-case.js';
import { CreateAdminUserUseCase } from '../../app/use-cases/admin-users/create-admin-user.use-case.js';
import { DeleteAdminUserUseCase } from '../../app/use-cases/admin-users/delete-admin-user.use-case.js';
import { ListAdminUsersUseCase } from '../../app/use-cases/admin-users/list-admin-users.use-case.js';
import { UpdateAdminUserUseCase } from '../../app/use-cases/admin-users/update-admin-user.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IAdminPasswordPort, IAdminUserValuesPort,
} from '../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type {
  IAdminUserReaderPort, IAdminUserUnitOfWorkPort,
} from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { ADMIN_PASSWORDS, ADMIN_USER_HTTP_OPERATIONS, ADMIN_USER_STORE } from './admin-users.tokens.js';

export function adminUserHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;

  return [
    {
      provide: ADMIN_USER_HTTP_OPERATIONS,
      inject: [ADMIN_USER_STORE, ADMIN_PASSWORDS, GET_CURRENT_ADMIN_USER, HOOK_CHANGES],
      useFactory: (store: IAdminUserReaderPort & IAdminUserUnitOfWorkPort, passwords: IAdminPasswordPort,
        current: IGetCurrentAdminUser, hooks: IHookChangesPort): IAdminUserOperationFactory => {
        const values: IAdminUserValuesPort = { nextId: randomUUID, nextVersion: randomUUID, now: () => new Date() };

        return {
          forSession: async (token) => {
            const access = new SessionAdminUserAccessAdapter(current, token);
            const actorId = await access.actorId();

            return {
              actorId,
              create: new CreateAdminUserUseCase(store, access, passwords, values, hooks),
              list: new ListAdminUsersUseCase(store, access),
              update: new UpdateAdminUserUseCase(store, access, passwords, values),
              block: new BlockAdminUserUseCase(store, access, values),
              remove: new DeleteAdminUserUseCase(store, access, values),
            };
          },
        };
      },
    },
    {
      provide: AdminUsersController,
      inject: [ADMIN_USER_HTTP_OPERATIONS],
      useFactory: (operations: IAdminUserOperationFactory) => new AdminUsersController(auth, operations),
    },
  ];
}
