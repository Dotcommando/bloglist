import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Provider } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import type { ICmsApi } from '@zarya/addon-contracts/cms';
import type { Connection } from 'mongoose';

import { AddonAdminSessionAdapter } from '../../adapters/inbound/rest/addons/addon-admin-session.adapter.js';
import { checked } from '../../adapters/outbound/backup/files/dump-files.js';
import { MongooseAddonUpdateGate }
  from '../../adapters/outbound/persistence/mongoose/addons/addon-update-gate.adapter.js';
import type { MongooseAddonWriteFence }
  from '../../adapters/outbound/persistence/mongoose/addons/addon-write-fence.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { MongoosePageReferenceAdapter }
  from '../../adapters/outbound/persistence/mongoose/pages/page-reference.adapter.js';
import { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import type { HookAddonRegistry } from '../../adapters/outbound/runtime/hooks/hook-addon-registry.js';
import { AddonOperationService } from '../../app/services/addons/addon-operation.service.js';
import type { CmsApiService } from '../../app/services/cms/cms-api.service.js';
import type { CmsExtensionRegistryService } from '../../app/services/cms/cms-extension-registry.service.js';
import type { HookChangesService } from '../../app/services/hooks/hook-changes.service.js';
import { BusinessError, BusinessErrorCode } from '../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IFindPublishedPages } from '../../ports/inbound/publication/find-published-pages.port.js';
import type { IResolveSite } from '../../ports/inbound/sites/resolve-site.port.js';
import type { ISiteAddonStorePort } from '../../ports/outbound/addons/site-addon-store.port.js';
import type { IAdminUserReaderPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import { CMS_API, CMS_EXTENSIONS } from '../cms/cms.tokens.js';
import { HOOK_ADDON_REGISTRY, HOOK_CHANGES, HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { FIND_PUBLISHED_PAGES, PUBLICATION_STORE, RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { RESOLVE_SITE } from '../sites/sites.tokens.js';
import { HOST_CMS_VERSION } from './addon-installation.tokens.js';
import { ADDON_PACKAGE_REGISTRY, ADDON_WRITE_FENCE, SITE_ADDON_STORE } from './addons.tokens.js';
import { installedAddons } from './installed-addons.js';

export function addonPackageProviders(settings: ILocalApplicationSettings | IPublicHttpSettings): Provider[] {
  const administration = 'operator' in settings || settings.adminAuth !== undefined;
  const root = path.join(settings.dumpsRoot ?? path.resolve('dumps'), '.installed-addons');

  return [{
    provide: HOST_CMS_VERSION,
    useFactory: async (): Promise<string> => {
      const metadata: unknown = JSON.parse(await readFile('package.json', 'utf8'));

      if (
        !metadata
        || typeof metadata !== 'object'
        || !('version' in metadata)
        || typeof metadata.version !== 'string'
        || !/^\d+\.\d+\.\d+$/.test(metadata.version)
      ) {
        throw new Error('An exact CMS version is required');
      }

      return metadata.version;
    },
  }, {
    provide: ADDON_PACKAGE_REGISTRY,
    inject: [HOST_CMS_VERSION, ModuleRef, MONGO_CONNECTION, SITE_ADDON_STORE, ADDON_WRITE_FENCE,
      RESOLVE_SITE, PUBLICATION_STORE,
      RELEASE_ACTIVATION, FIND_PUBLISHED_PAGES, HOOK_ADDON_REGISTRY, HOOK_CHANGES, HOOK_EVENTS, ...(administration
        ? [GET_CURRENT_ADMIN_USER, ADMIN_USER_STORE] : [])],
    useFactory: async (cmsVersion: string, ref: ModuleRef, connection: Connection, store: ISiteAddonStorePort,
      fence: MongooseAddonWriteFence,
      sites: IResolveSite, publications: IPublicationStorePort, activation: IReleaseActivationPort,
      publishedPages: IFindPublishedPages,
      hookRegistry: HookAddonRegistry, hooks: HookChangesService, hookEvents: MongooseHookEvents,
      current?: IGetCurrentAdminUser, users?: IAdminUserReaderPort): Promise<AddonPackageRegistry> => {
      const pages = new MongoosePageReferenceAdapter(connection.model<IPageRecord>('Page', pageSchema));
      const secrets = new Map<string, Promise<string>>();
      const registry = new AddonPackageRegistry(root, connection, installedAddons, {
        coordinatorOnly: 'coordinatorOnly' in settings && settings.coordinatorOnly === true,
        cmsVersion,
        generationBound: !('coordinatorOnly' in settings && settings.coordinatorOnly === true),
        updateState: key => new MongooseAddonUpdateGate(connection).read(key),
        cms: {
          forAddon: (addonKey) => ({
            forSite: async (siteId, access = AddonOperationAccess.PublicEnabled): Promise<ICmsApi> => {
              const before = async (): Promise<void> => {
                await new AddonOperationService(store, addonKey).authorize(siteId, access);
              };

              await before();

              return ref.get<CmsApiService>(CMS_API, { strict: false }).forContext({
                siteId, actorId: 'cms-addon:' + addonKey,
              }, before);
            },
          }),
          register: (addonKey, extension) => ref.get<CmsExtensionRegistryService>(CMS_EXTENSIONS,
            { strict: false }).register(addonKey, extension),
          unregister: (addonKey) => ref.get<CmsExtensionRegistryService>(CMS_EXTENSIONS,
            { strict: false }).unregister(addonKey),
        },
        hooks: { source: hooks, record: (intent, session) => hookEvents.record(intent, session) },
        connection,
        sites,
        publications,
        activation,
        publishedPages: { findPublished: (siteId, pageIds) => publishedPages.execute({ siteId, pageIds }) },
        fence,
        current: current ? new AddonAdminSessionAdapter(current,
          'adminAuth' in settings ? settings.adminAuth?.cookieVersion : undefined) : null,
        users: users ?? null,
        origin: 'adminAuth' in settings ? settings.adminAuth?.origin ?? null : null,
        policy: (key) => new AddonOperationService(store, key),
        requirePage: async (siteId, pageId): Promise<void> => {
          if (!await pages.findPage(siteId, pageId)) {
            throw new BusinessError(BusinessErrorCode.NotFound, 'Page not found');
          }
        },
        secret: (key): Promise<string> => {
          let value = secrets.get(key);

          if (!value) {
            value = (async (): Promise<string> => {
              const filename = await checked(root, '.secrets/' + key + '.txt');

              await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
              await writeFile(filename, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
                .catch((error: unknown) => {
                  if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
                    throw error;
                  }
                });
              const secret = await readFile(filename, 'utf8');

              if (!/^[a-f0-9]{64}$/.test(secret)) {
                throw new Error('Invalid installation secret');
              }

              return secret;
            })();
            secrets.set(key, value);
          }

          return value;
        },
      }, hookRegistry);

      await registry.initialize();

      return registry;
    },
  }, {
    provide: 'AddonPackageLifecycle',
    inject: [ADDON_PACKAGE_REGISTRY],
    useFactory: (registry: AddonPackageRegistry) => ({
      onApplicationShutdown: async (): Promise<void> => {
        await registry.close();
      },
    }),
  }];
}
