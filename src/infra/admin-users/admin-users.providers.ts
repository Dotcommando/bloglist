import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import {
  LocalAdminUserAccessAdapter,
} from '../../adapters/outbound/access/local/admin-users/local-admin-user-access.adapter.js';
import {
  MongooseAdminUserStore,
} from '../../adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { BlockAdminUserUseCase } from '../../app/use-cases/admin-users/block-admin-user.use-case.js';
import { DeleteAdminUserUseCase } from '../../app/use-cases/admin-users/delete-admin-user.use-case.js';
import { GetAdminUserUseCase } from '../../app/use-cases/admin-users/get-admin-user.use-case.js';
import { ListAdminUsersUseCase } from '../../app/use-cases/admin-users/list-admin-users.use-case.js';
import { UpdateAdminUserUseCase } from '../../app/use-cases/admin-users/update-admin-user.use-case.js';
import type {
  IAdminPasswordPort,
  IAdminUserValuesPort,
} from '../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserAccessPort } from '../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IAdminUserReaderPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { LIST_ADMIN_USERS } from './admin-users.tokens.js';
import { DELETE_ADMIN_USER } from './admin-users.tokens.js';
import { BLOCK_ADMIN_USER } from './admin-users.tokens.js';
import { ADMIN_PASSWORDS, UPDATE_ADMIN_USER } from './admin-users.tokens.js';
import {
  ADMIN_USER_ACCESS,
  ADMIN_USER_READER, ADMIN_USER_STORE, ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_VALUES, GET_ADMIN_USER,
} from './admin-users.tokens.js';

export function adminUserProviders(settings: ILocalApplicationSettings): Provider[] {
  return [
    {
      provide: LIST_ADMIN_USERS,
      inject: [ADMIN_USER_READER, ADMIN_USER_ACCESS],
      useFactory: (reader: IAdminUserReaderPort, access: IAdminUserAccessPort) =>
        new ListAdminUsersUseCase(reader, access),
    },
    {
      provide: DELETE_ADMIN_USER,
      inject: [ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_ACCESS, ADMIN_USER_VALUES],
      useFactory: (work: IAdminUserUnitOfWorkPort, access: IAdminUserAccessPort, values: IAdminUserValuesPort) =>
        new DeleteAdminUserUseCase(work, access, values),
    },
    {
      provide: BLOCK_ADMIN_USER,
      inject: [ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_ACCESS, ADMIN_USER_VALUES],
      useFactory: (work: IAdminUserUnitOfWorkPort, access: IAdminUserAccessPort, values: IAdminUserValuesPort) =>
        new BlockAdminUserUseCase(work, access, values),
    },
    { provide: ADMIN_PASSWORDS, useFactory: () => new ScryptAdminPasswordAdapter() },
    {
      provide: UPDATE_ADMIN_USER,
      inject: [ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_ACCESS, ADMIN_PASSWORDS, ADMIN_USER_VALUES],
      useFactory: (work: IAdminUserUnitOfWorkPort, access: IAdminUserAccessPort,
        passwords: IAdminPasswordPort, values: IAdminUserValuesPort) =>
        new UpdateAdminUserUseCase(work, access, passwords, values),
    },
    {
      provide: ADMIN_USER_STORE,
      inject: [MONGO_CONNECTION, HOOK_EVENTS],
      useFactory: (connection: Connection, events: MongooseHookEvents) => new
      MongooseAdminUserStore(connection, events),
    },
    { provide: ADMIN_USER_READER, useExisting: ADMIN_USER_STORE },
    { provide: ADMIN_USER_UNIT_OF_WORK, useExisting: ADMIN_USER_STORE },
    { provide: ADMIN_USER_ACCESS, useFactory: () => new LocalAdminUserAccessAdapter(settings.operator) },
    { provide: ADMIN_USER_VALUES, useValue: { nextId: randomUUID, nextVersion: randomUUID, now: () => new Date() } },
    {
      provide: GET_ADMIN_USER,
      inject: [ADMIN_USER_READER, ADMIN_USER_ACCESS],
      useFactory: (reader: IAdminUserReaderPort, access: IAdminUserAccessPort) =>
        new GetAdminUserUseCase(reader, access),
    },
  ];
}
