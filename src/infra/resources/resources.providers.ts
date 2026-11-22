import type { Provider } from '@nestjs/common';

import { AdminResourcesController } from '../../adapters/inbound/rest/resources/admin-resources.controller.js';
import { CalibrationAddonCatalog }
  from '../../adapters/outbound/capabilities/calibration/calibration-addon-catalog.adapter.js';
import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import { ChangeInstallationResourcesUseCase, GetInstallationResourcesUseCase } from
  '../../app/use-cases/resources/installation-resources.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IChangeInstallationResources, IGetInstallationResources } from
  '../../ports/inbound/resources/installation-resources.port.js';
import type { ISiteAddonStorePort } from '../../ports/outbound/addons/site-addon-store.port.js';
import type { IInstallationResourcesPort } from '../../ports/outbound/resources/installation-resources.port.js';
import type { ISiteResourceCatalogPort } from '../../ports/outbound/resources/site-resource-catalog.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { ADDON_PACKAGE_REGISTRY, SITE_ADDON_STORE } from '../addons/addons.tokens.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import {
  CHANGE_INSTALLATION_RESOURCES, GET_INSTALLATION_RESOURCES, INSTALLATION_RESOURCES, RESOURCE_SITE_CATALOG,
} from './resources.tokens.js';

export function resourceProviders(
  settings: Pick<IPublicHttpSettings, 'installationResources' | 'adminAuth'>,
): Provider[] {
  if (!settings.installationResources) {
    return [];
  }

  return [
    { provide: INSTALLATION_RESOURCES, useValue: settings.installationResources },
    {
      provide: RESOURCE_SITE_CATALOG,
      inject: [SITE_REPOSITORY, SITE_ADDON_STORE, ADDON_PACKAGE_REGISTRY],
      useFactory: (sites: ISiteRepository, addons: ISiteAddonStorePort, packages: AddonPackageRegistry) =>
        new CalibrationAddonCatalog(sites, addons, packages),
    },
    {
      provide: GET_INSTALLATION_RESOURCES,
      inject: [INSTALLATION_RESOURCES, RESOURCE_SITE_CATALOG, GET_CURRENT_ADMIN_USER],
      useFactory: (runtime: IInstallationResourcesPort, sites: ISiteResourceCatalogPort,
        current: IGetCurrentAdminUser) =>
        new GetInstallationResourcesUseCase(runtime, sites, current),
    },
    {
      provide: CHANGE_INSTALLATION_RESOURCES,
      inject: [INSTALLATION_RESOURCES, RESOURCE_SITE_CATALOG, GET_CURRENT_ADMIN_USER],
      useFactory: (runtime: IInstallationResourcesPort, sites: ISiteResourceCatalogPort,
        current: IGetCurrentAdminUser) =>
        new ChangeInstallationResourcesUseCase(runtime, sites, current),
    },
    ...(settings.adminAuth ? [{
      provide: AdminResourcesController,
      inject: [GET_CURRENT_ADMIN_USER, GET_INSTALLATION_RESOURCES, CHANGE_INSTALLATION_RESOURCES],
      useFactory: (current: IGetCurrentAdminUser, get: IGetInstallationResources,
        change: IChangeInstallationResources) =>
        new AdminResourcesController(settings.adminAuth!, current, get, change),
    }] : []),
  ];
}
