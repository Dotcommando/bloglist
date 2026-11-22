import type { Provider } from '@nestjs/common';

import {
  CreateAdminUserFromConsoleUseCase,
} from '../../app/use-cases/admin-users/create-admin-user-from-console.use-case.js';
import type {
  IAdminPasswordPort,
  IAdminUserAccessPort,
  IAdminUserValuesPort,
} from '../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import {
  ADMIN_PASSWORDS, ADMIN_USER_ACCESS,
  ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_VALUES, CREATE_ADMIN_USER_FROM_CONSOLE,
} from './admin-users.tokens.js';

export function adminUserCreationProvider(): Provider {
  return {
    provide: CREATE_ADMIN_USER_FROM_CONSOLE,
    inject: [ADMIN_USER_UNIT_OF_WORK, ADMIN_USER_ACCESS, ADMIN_PASSWORDS, ADMIN_USER_VALUES, HOOK_CHANGES],
    useFactory: (work: IAdminUserUnitOfWorkPort, access: IAdminUserAccessPort, passwords: IAdminPasswordPort,
      values: IAdminUserValuesPort, hooks: IHookChangesPort) =>
      new CreateAdminUserFromConsoleUseCase(work, access, passwords, values, hooks),
  };
}
