import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { AdminAddonRuntimeController } from '../../adapters/inbound/rest/addons/admin-addon-runtime.controller.js';
import { AdminAddonsController } from '../../adapters/inbound/rest/addons/admin-addons.controller.js';
import {
  AdminAddonAccessAdapter,
} from '../../adapters/outbound/access/admin-users/addons/admin-addon-access.adapter.js';
import { LocalAddonAccessAdapter } from '../../adapters/outbound/access/local/addons/local-addon-access.adapter.js';
import {
  MongooseAddonWriteFence,
} from '../../adapters/outbound/persistence/mongoose/addons/addon-write-fence.adapter.js';
import {
  MongooseSiteAddonStore,
} from '../../adapters/outbound/persistence/mongoose/addons/site-addon-store.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { verifyMigrations } from '../../adapters/outbound/persistence/mongoose/migrations.js';
import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import {
  RegisteredAddonAvailabilityAdapter,
} from '../../adapters/outbound/runtime/addons/registered-addon-availability.adapter.js';
import { RegisteredAddonCatalogAdapter } from
  '../../adapters/outbound/runtime/addons/registered-addon-catalog.adapter.js';
import { AddonRuntimeService } from '../../app/services/addons/addon-runtime.service.js';
import { ConfigureSiteAddonUseCase } from '../../app/use-cases/addons/configure-site-addon.use-case.js';
import { DisableSiteAddonUseCase } from '../../app/use-cases/addons/disable-site-addon.use-case.js';
import { EnableSiteAddonUseCase } from '../../app/use-cases/addons/enable-site-addon.use-case.js';
import { GetAddonRuntimeAssetUseCase } from '../../app/use-cases/addons/get-addon-runtime-asset.use-case.js';
import { GetAddonRuntimeViewUseCase } from '../../app/use-cases/addons/get-addon-runtime-view.use-case.js';
import { GetSiteAddonUseCase } from '../../app/use-cases/addons/get-site-addon.use-case.js';
import { ListSiteAddonsUseCase } from '../../app/use-cases/addons/list-site-addons.use-case.js';
import type { IGetAddonRuntimeAsset, IGetAddonRuntimeView }
  from '../../ports/inbound/addons/addon-runtime-assets.port.js';
import type { IConfigureSiteAddon } from '../../ports/inbound/addons/configure-site-addon.port.js';
import type { IDisableSiteAddon } from '../../ports/inbound/addons/disable-site-addon.port.js';
import type { IEnableSiteAddon } from '../../ports/inbound/addons/enable-site-addon.port.js';
import type { IGetSiteAddon } from '../../ports/inbound/addons/get-site-addon.port.js';
import type { IListSiteAddons } from '../../ports/inbound/addons/list-site-addons.port.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IAddonAvailabilityPort } from '../../ports/outbound/addons/addon-availability.port.js';
import type { IAddonCatalogPort } from '../../ports/outbound/addons/addon-catalog.port.js';
import type { IAddonRuntimeAssets } from '../../ports/outbound/addons/addon-runtime-assets.port.js';
import type { ISiteAddonAccessPort, ISiteAddonValuesPort } from '../../ports/outbound/addons/site-addon-access.port.js';
import type { ISiteAddonStorePort } from '../../ports/outbound/addons/site-addon-store.port.js';
import type { IAdminUserReaderPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { addonInstallationProviders } from './addon-installation.providers.js';
import { addonPackageProviders } from './addon-packages.providers.js';
import { AddonRuntimeLifecycle } from './addon-runtime.lifecycle.js';
import { ADDON_AVAILABILITY } from './addons.tokens.js';
import {
  ADDON_ACCESS, ADDON_CATALOG, ADDON_VALUES, ADDON_WRITE_FENCE, CONFIGURE_SITE_ADDON,
  DISABLE_SITE_ADDON, ENABLE_SITE_ADDON, GET_SITE_ADDON, LIST_SITE_ADDONS,
  SITE_ADDON_STORE,
} from './addons.tokens.js';
import { ADDON_PACKAGE_REGISTRY } from './addons.tokens.js';
import { GET_ADDON_RUNTIME_ASSET, GET_ADDON_RUNTIME_VIEW } from './addons.tokens.js';

export function addonProviders(settings: ILocalApplicationSettings | IPublicHttpSettings): Provider[] {
  const management = 'operator' in settings || settings.adminAuth !== undefined;
  const providers: Provider[] = [
    ...addonPackageProviders(settings),
    {
      provide: ADDON_AVAILABILITY,
      inject: [MONGO_CONNECTION, ADDON_PACKAGE_REGISTRY],
      useFactory: (connection: Connection, packages: AddonPackageRegistry) => new RegisteredAddonAvailabilityAdapter(
        () => packages.registrations().map((addon) => addon.definition.addonKey),
        async (addonKey) => {
          const addon = packages.registrations().find((item) => item.definition.addonKey === addonKey);

          if (!addon) {
            throw new Error('Unknown installed add-on');
          }
          if (packages.runtime(addonKey)) {
            await packages.verify(addonKey);
          } else {
            await verifyMigrations(connection, addon.migrationsDirectory, addonKey);
          }
        },
      ),
    },
    {
      provide: AddonRuntimeLifecycle,
      inject: [SITE_ADDON_STORE, ADDON_CATALOG, ADDON_AVAILABILITY],
      useFactory: (store: ISiteAddonStorePort, registry: IAddonCatalogPort, availability: IAddonAvailabilityPort) =>
        new AddonRuntimeLifecycle(new AddonRuntimeService(store, registry, availability),
          'coordinatorOnly' in settings && settings.coordinatorOnly === true),
    },
    {
      provide: ADDON_CATALOG,
      inject: [ADDON_PACKAGE_REGISTRY],
      useFactory: (packages: AddonPackageRegistry): IAddonCatalogPort => new RegisteredAddonCatalogAdapter(packages),
    },
    { provide: ADDON_VALUES, useValue: { nextId: randomUUID, nextVersion: randomUUID, now: () => new Date() } },
    {
      provide: SITE_ADDON_STORE,
      inject: [
        MONGO_CONNECTION,
        HOOK_EVENTS,
      ],
      useFactory: (
        connection: Connection,
        events: MongooseHookEvents,
      ) => new MongooseSiteAddonStore(connection, events),
    },
    {
      provide: ADDON_WRITE_FENCE,
      inject: [
        MONGO_CONNECTION,
      ],
      useFactory: (
        connection: Connection,
      ) => new MongooseAddonWriteFence(connection),
    },
  ];

  if (!management) {
    return providers;
  }
  providers.push(...addonInstallationProviders(settings));
  providers.push('operator' in settings ? {
    provide: ADDON_ACCESS,
    inject: [SITE_REPOSITORY],
    useFactory: (sites: ISiteRepository) => new LocalAddonAccessAdapter(settings.operator,
      async (siteId) => (await sites.findById(siteId)) !== null),
  } : {
    provide: ADDON_ACCESS,
    inject: [ADMIN_USER_STORE, SITE_REPOSITORY],
    useFactory: (users: IAdminUserReaderPort, sites: ISiteRepository) => new AdminAddonAccessAdapter(users,
      async (siteId) => (await sites.findById(siteId)) !== null),
  });
  providers.push({
    provide: GET_ADDON_RUNTIME_VIEW,
    inject: [ADDON_PACKAGE_REGISTRY, ADDON_ACCESS],
    useFactory: (assets: IAddonRuntimeAssets, access: ISiteAddonAccessPort) =>
      new GetAddonRuntimeViewUseCase(assets, access),
  },
  {
    provide: GET_ADDON_RUNTIME_ASSET,
    inject: [ADDON_PACKAGE_REGISTRY, ADDON_ACCESS],
    useFactory: (assets: IAddonRuntimeAssets, access: ISiteAddonAccessPort) =>
      new GetAddonRuntimeAssetUseCase(assets, access),
  });

  if ('adminAuth' in settings && settings.adminAuth) {
    const auth = settings.adminAuth;

    providers.push({
      provide: AdminAddonRuntimeController,
      inject: [GET_CURRENT_ADMIN_USER, GET_ADDON_RUNTIME_VIEW, GET_ADDON_RUNTIME_ASSET, ADDON_PACKAGE_REGISTRY,
        SITE_ADDON_STORE, SITE_REPOSITORY],
      useFactory: (current: IGetCurrentAdminUser, view: IGetAddonRuntimeView, asset: IGetAddonRuntimeAsset,
        packages: AddonPackageRegistry, store: ISiteAddonStorePort, sites: ISiteRepository) =>
        new AdminAddonRuntimeController(auth, current, view, asset, {
          list: async (siteId, actorId, authority) => {
            const connections = await store.list(siteId);
            const available = await Promise.all(connections.map(async (item) => {
              const enabled = item.status === 'Enabled';
              const view = await packages.workspace(item.addonKey, siteId, actorId, authority, enabled);

              if (!view) {
                return undefined;
              }

              const labels = item.configuration.values.adminMenuLabels;
              const en = labels && typeof labels === 'object' && 'en' in labels && typeof labels.en === 'string'
                ? labels.en : undefined;
              const ru = labels && typeof labels === 'object' && 'ru' in labels && typeof labels.ru === 'string'
                ? labels.ru : undefined;

              return {
                ...view,
                label: { en: en || view.label.en, ru: ru || view.label.ru },
                menuBadge: packages.canReadWorkspaceBadge(item.addonKey, view.actionIds),
              };
            }));

            return available.filter((item) => item !== undefined);
          },
          read: (key, digest, filename) => packages.read(key, digest, filename),
          timeZone: async (siteId) => (await sites.findById(siteId))?.timeZone ?? null,
        }),
    });
  }
  providers.push(
    {
      provide: LIST_SITE_ADDONS,
      inject: [
        SITE_ADDON_STORE,
        ADDON_CATALOG,
        ADDON_ACCESS,
      ],
      useFactory: (
        store: ISiteAddonStorePort,
        registry: IAddonCatalogPort,
        access: ISiteAddonAccessPort,
      ) => new ListSiteAddonsUseCase(store, registry, access),
    },
    {
      provide: GET_SITE_ADDON,
      inject: [
        SITE_ADDON_STORE,
        ADDON_CATALOG,
        ADDON_ACCESS,
      ],
      useFactory: (
        store: ISiteAddonStorePort,
        registry: IAddonCatalogPort,
        access: ISiteAddonAccessPort,
      ) => new GetSiteAddonUseCase(store, registry, access),
    },
    {
      provide: ENABLE_SITE_ADDON,
      inject: [SITE_ADDON_STORE, ADDON_CATALOG, ADDON_ACCESS, ADDON_VALUES, ADDON_AVAILABILITY, HOOK_CHANGES,
      ],
      useFactory: (store: ISiteAddonStorePort, registry: IAddonCatalogPort, access: ISiteAddonAccessPort,
        values: ISiteAddonValuesPort, availability: IAddonAvailabilityPort, hooks: IHookChangesPort,
      ) => new EnableSiteAddonUseCase(store, registry, access, values, availability, hooks),
    },
    {
      provide: CONFIGURE_SITE_ADDON,
      inject: [SITE_ADDON_STORE, ADDON_CATALOG, ADDON_ACCESS, ADDON_VALUES, ADDON_AVAILABILITY, HOOK_CHANGES,
      ],
      useFactory: (store: ISiteAddonStorePort, registry: IAddonCatalogPort, access: ISiteAddonAccessPort,
        values: ISiteAddonValuesPort, availability: IAddonAvailabilityPort, hooks: IHookChangesPort,
      ) => new ConfigureSiteAddonUseCase(store, registry, access, values, availability, hooks),
    },
    {
      provide: DISABLE_SITE_ADDON,
      inject: [SITE_ADDON_STORE, ADDON_ACCESS, ADDON_VALUES, HOOK_CHANGES,
      ],
      useFactory: (store: ISiteAddonStorePort, access: ISiteAddonAccessPort, values: ISiteAddonValuesPort,
        hooks: IHookChangesPort,
      ) => new DisableSiteAddonUseCase(store, access, values, hooks),
    },
  );

  if ('adminAuth' in settings && settings.adminAuth) {
    const auth = settings.adminAuth;

    providers.push({
      provide: AdminAddonsController,
      inject: [GET_CURRENT_ADMIN_USER, LIST_SITE_ADDONS, GET_SITE_ADDON, ENABLE_SITE_ADDON,
        CONFIGURE_SITE_ADDON, DISABLE_SITE_ADDON, ADDON_PACKAGE_REGISTRY],
      useFactory: (current: IGetCurrentAdminUser, list: IListSiteAddons, get: IGetSiteAddon,
        enable: IEnableSiteAddon, configure: IConfigureSiteAddon, disable: IDisableSiteAddon,
        packages: AddonPackageRegistry) =>
        new AdminAddonsController(auth, current, list, get, enable, configure, disable,
          (key) => packages.hasMenuBadge(key), (key) => Boolean(packages.view(key)?.entry),
          (key) => packages.hasBoundAdminView(key)),
    });
  }

  return providers;
}
