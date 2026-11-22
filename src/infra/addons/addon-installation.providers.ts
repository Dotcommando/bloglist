import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { AdminAddonInstallationsController }
  from '../../adapters/inbound/rest/addons/admin-addon-installations.controller.js';
import {
  MongooseAddonInstallationStore,
} from '../../adapters/outbound/persistence/mongoose/addons/addon-installation-store.adapter.js';
import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import {
  GitHubAddonPackageDelivery,
} from '../../adapters/outbound/runtime/addons/github-addon-package-delivery.adapter.js';
import { GitHubAppTokens } from '../../adapters/outbound/runtime/addons/github-app-tokens.adapter.js';
import {
  InstallAddonFromRepositoryUseCase,
} from '../../app/use-cases/addons/install-addon-from-repository.use-case.js';
import { ListAddonInstallationsUseCase }
  from '../../app/use-cases/addons/list-addon-installations.use-case.js';
import type { IInstallAddonFromRepository }
  from '../../ports/inbound/addons/install-addon-from-repository.port.js';
import type { IListAddonInstallations } from '../../ports/inbound/addons/list-addon-installations.port.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IAddonInstallationStore } from '../../ports/outbound/addons/addon-installation-store.port.js';
import type { IAddonPackageDelivery } from '../../ports/outbound/addons/addon-package-delivery.port.js';
import type { ISiteAddonAccessPort, ISiteAddonValuesPort }
  from '../../ports/outbound/addons/site-addon-access.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import {
  ADDON_INSTALLATION_STORE, ADDON_PACKAGE_DELIVERY, HOST_CMS_VERSION, INSTALL_ADDON_FROM_REPOSITORY,
  LIST_ADDON_INSTALLATIONS,
} from './addon-installation.tokens.js';
import { ADDON_ACCESS, ADDON_PACKAGE_REGISTRY, ADDON_VALUES } from './addons.tokens.js';

export function addonInstallationProviders(settings: ILocalApplicationSettings | IPublicHttpSettings): Provider[] {
  const providers: Provider[] = [
    {
      provide: LIST_ADDON_INSTALLATIONS,
      inject: [ADDON_INSTALLATION_STORE, ADDON_ACCESS],
      useFactory: (store: IAddonInstallationStore, access: ISiteAddonAccessPort) =>
        new ListAddonInstallationsUseCase(store, access),
    },
    {
      provide: ADDON_INSTALLATION_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseAddonInstallationStore(connection),
    },
    {
      provide: ADDON_PACKAGE_DELIVERY,
      inject: [ADDON_PACKAGE_REGISTRY, HOST_CMS_VERSION],
      useFactory: (registry: AddonPackageRegistry, version: string) => new GitHubAddonPackageDelivery(
        path.join(settings.dumpsRoot ?? path.resolve('dumps'), '.installed-addons', '.downloads'), registry, version,
        fetch, settings.githubApp ? new GitHubAppTokens(settings.githubApp, version) : undefined,
      ),
    },
    {
      provide: INSTALL_ADDON_FROM_REPOSITORY,
      inject: [ADDON_INSTALLATION_STORE, ADDON_PACKAGE_DELIVERY, ADDON_ACCESS, ADDON_VALUES],
      useFactory: (store: IAddonInstallationStore, delivery: IAddonPackageDelivery,
        access: ISiteAddonAccessPort, values: ISiteAddonValuesPort) =>
        new InstallAddonFromRepositoryUseCase(store, delivery, access, values),
    },
  ];

  if ('adminAuth' in settings && settings.adminAuth) {
    const auth = settings.adminAuth;

    providers.push({
      provide: AdminAddonInstallationsController,
      inject: [GET_CURRENT_ADMIN_USER, INSTALL_ADDON_FROM_REPOSITORY, LIST_ADDON_INSTALLATIONS],
      useFactory: (current: IGetCurrentAdminUser, install: IInstallAddonFromRepository,
        list: IListAddonInstallations) =>
        new AdminAddonInstallationsController(auth, current, install, list),
    });
  }

  return providers;
}
