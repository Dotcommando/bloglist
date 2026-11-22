import type {
  Provider,
} from '@nestjs/common';
import type {
  Connection,
} from 'mongoose';

import {
  AdminInstallationSettingsController,
} from '../../adapters/inbound/rest/installation/admin-installation-settings.controller.js';
import type {
  IAdminHttpSettings,
} from '../../adapters/inbound/rest/shared/admin-http.boundary.js';
import {
  MongooseInstallationSettingsStore,
} from '../../adapters/outbound/persistence/mongoose/installation/installation-settings-store.adapter.js';
import {
  AdminAddressReachabilityAdapter,
} from '../../adapters/outbound/security/installation/admin-address-reachability.adapter.js';
import {
  ChangeAdminAddressUseCase,
} from '../../app/use-cases/installation/change-admin-address.use-case.js';
import {
  GetInstallationSettingsUseCase,
} from '../../app/use-cases/installation/get-installation-settings.use-case.js';
import type {
  IGetCurrentAdminUser,
} from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IChangeAdminAddress, IGetInstallationSettings,
} from '../../ports/inbound/installation/installation-settings.port.js';
import type {
  IAdminAddressReachabilityPort, IInstallationSettingsStore,
} from '../../ports/outbound/installation/installation-settings-store.port.js';
import {
  GET_CURRENT_ADMIN_USER,
} from '../admin-auth/admin-auth.tokens.js';
import {
  MONGO_CONNECTION,
} from '../persistence/persistence.tokens.js';
import {
  ADMIN_ADDRESS_REACHABILITY, CHANGE_ADMIN_ADDRESS, GET_INSTALLATION_SETTINGS, INSTALLATION_SETTINGS_STORE,
} from './installation.tokens.js';

export function installationProviders(auth?: IAdminHttpSettings): Provider[] {
  return [
    {
      provide: INSTALLATION_SETTINGS_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseInstallationSettingsStore(connection),
    },
    {
      provide: ADMIN_ADDRESS_REACHABILITY,
      inject: [INSTALLATION_SETTINGS_STORE],
      useFactory: (store: MongooseInstallationSettingsStore) =>
        new AdminAddressReachabilityAdapter(() => store.probeKey()),
    },
    {
      provide: GET_INSTALLATION_SETTINGS,
      inject: [INSTALLATION_SETTINGS_STORE, GET_CURRENT_ADMIN_USER],
      useFactory: (store: IInstallationSettingsStore, current: IGetCurrentAdminUser) =>
        new GetInstallationSettingsUseCase(store, current),
    },
    {
      provide: CHANGE_ADMIN_ADDRESS,
      inject: [INSTALLATION_SETTINGS_STORE, GET_CURRENT_ADMIN_USER, ADMIN_ADDRESS_REACHABILITY],
      useFactory: (store: IInstallationSettingsStore, current: IGetCurrentAdminUser,
        reachability: IAdminAddressReachabilityPort) =>
        new ChangeAdminAddressUseCase(store, current, reachability),
    },
    ...(auth ? [{
      provide: AdminInstallationSettingsController,
      inject: [GET_CURRENT_ADMIN_USER, GET_INSTALLATION_SETTINGS, CHANGE_ADMIN_ADDRESS],
      useFactory: (current: IGetCurrentAdminUser, get: IGetInstallationSettings, change: IChangeAdminAddress) =>
        new AdminInstallationSettingsController(auth, current, get, change),
    }] : []),
  ];
}
