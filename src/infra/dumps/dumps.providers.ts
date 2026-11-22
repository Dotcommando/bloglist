import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { AdminDumpsController } from '../../adapters/inbound/rest/dumps/admin-dumps.controller.js';
import { DumpMaintenance } from '../../adapters/outbound/backup/files/dump-maintenance.js';
import { InProcessDumpCaptureAdapter } from '../../adapters/outbound/backup/files/in-process-dump-capture.adapter.js';
import { InstallationDumpStore } from '../../adapters/outbound/backup/files/installation-dump.adapter.js';
import { FileAddonDumpTransfer } from '../../adapters/outbound/backup/files/partial-dump-addons.js';
import { SharedDumpMaintenance } from '../../adapters/outbound/backup/files/shared-dump-maintenance.js';
import type { FileSiteDumpStore } from '../../adapters/outbound/backup/files/site-dump-store.adapter.js';
import { DumpDatabase } from '../../adapters/outbound/backup/mongoose/dump-database.adapter.js';
import { ProcessDumpCaptureAdapter } from '../../adapters/outbound/backup/process/dump-capture.adapter.js';
import { ProcessSiteDumpStore } from '../../adapters/outbound/backup/process/process-site-dump-store.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import type {
  FilePublishedContentAdapter,
} from '../../adapters/outbound/publication/files/published-content.adapter.js';
import type {
  VerifiedPublicationCatalogAdapter,
} from '../../adapters/outbound/publication/memory/verified-publication-catalog.adapter.js';
import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import { CreateSiteDumpUseCase } from '../../app/use-cases/dumps/create-site-dump.use-case.js';
import { DeleteSiteDumpUseCase } from '../../app/use-cases/dumps/delete-site-dump.use-case.js';
import { GetDumpExportItemsUseCase } from '../../app/use-cases/dumps/get-dump-export-items.use-case.js';
import { GetSiteDumpUseCase } from '../../app/use-cases/dumps/get-site-dump.use-case.js';
import { ImportSiteDumpUseCase } from '../../app/use-cases/dumps/import-site-dump.use-case.js';
import { InspectSiteDumpUseCase } from '../../app/use-cases/dumps/inspect-site-dump.use-case.js';
import { ListSiteDumpsUseCase } from '../../app/use-cases/dumps/list-site-dumps.use-case.js';
import { RestoreSiteDumpUseCase } from '../../app/use-cases/dumps/restore-site-dump.use-case.js';
import { CaptureSiteDumpUseCase } from '../../app/use-cases/resources/capture-site-dump.use-case.js';
import { hasAdministratorGrant } from '../../domain/authorization/admin-authorization.js';
import { SiteDumpType } from '../../domain/dumps/site-dump.js';
import { BusinessError, BusinessErrorCode } from '../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  ICreateSiteDump, IDeleteSiteDump, IGetDumpExportItems, IGetSiteDump, IImportSiteDump, IInspectSiteDump,
  IListSiteDumps, IRestoreSiteDump,
} from '../../ports/inbound/dumps/site-dumps.port.js';
import type { ICaptureSiteDump } from '../../ports/inbound/resources/capture-site-dump.port.js';
import type { IAdminUserReaderPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { ISiteDumpCapturePort } from '../../ports/outbound/dumps/site-dump-capture.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../ports/outbound/dumps/site-dump-store.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IRequestDocumentCachePort } from '../../ports/outbound/publication/request-document-cache.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { ADDON_PACKAGE_REGISTRY } from '../addons/addons.tokens.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import {
  PUBLISHED_CONTENT, PUBLISHED_PAGE_CATALOG, REQUEST_DOCUMENT_CACHE_STORAGE,
} from '../publication/publication.tokens.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import {
  CAPTURE_SITE_DUMP, CREATE_SITE_DUMP, DELETE_SITE_DUMP, DUMP_CAPTURE, DUMP_CHILD_CAPTURE,
  DUMP_INLINE_CAPTURE, DUMP_MAINTENANCE, GET_DUMP_EXPORT_ITEMS, GET_SITE_DUMP,
  IMPORT_SITE_DUMP, INSPECT_SITE_DUMP,
  LIST_SITE_DUMPS,
  RESTORE_SITE_DUMP, SITE_DUMP_ACCESS, SITE_DUMP_STORE,
} from './dumps.tokens.js';

export function dumpProviders(settings: ILocalApplicationSettings | IPublicHttpSettings): Provider[] {
  if (!('operator' in settings) && !settings.adminAuth) {
    return settings.sharedMaintenanceRoot ? [{
      provide: DUMP_MAINTENANCE,
      inject: [REQUEST_DOCUMENT_CACHE_STORAGE, PUBLISHED_CONTENT, PUBLISHED_PAGE_CATALOG],
      useFactory: (cache: IRequestDocumentCachePort, content: FilePublishedContentAdapter,
        catalog: VerifiedPublicationCatalogAdapter) =>
        new SharedDumpMaintenance(settings.sharedMaintenanceRoot!, () => {
          cache.purge();
          content.purgePlans();
          catalog.purge();
        }),
    }] : [];
  }

  const rendering = 'operator' in settings ? settings.rendering : settings;
  const storage = Object.freeze({
    root: settings.dumpsRoot ?? path.resolve('dumps'),
    sourcesRoot: rendering?.sourcesRoot ?? path.resolve('sites'),
    artifactsRoot: rendering?.artifactsRoot ?? path.resolve('artifacts'),
    ...(settings.media ? { mediaRoot: settings.media.root } : {}),
  });
  const providers: Provider[] = [
    ...('dumpChildCapture' in settings && settings.dumpChildCapture ? [{
      provide: DUMP_CHILD_CAPTURE,
      useValue: settings.dumpChildCapture,
    }] : [{
      provide: DUMP_CHILD_CAPTURE,
      inject: [ADDON_PACKAGE_REGISTRY],
      useFactory: (packages: AddonPackageRegistry) => new ProcessDumpCaptureAdapter({
        runner: new URL(import.meta.url.endsWith('.ts')
          ? '../../../dist/infra/dumps/dump-capture-worker.js' : './dump-capture-worker.js', import.meta.url),
        storage,
        mongoUri: settings.mongoUri,
        database: settings.database,
        addonMetadata: () => packages.dumpMetadata(),
      }),
    }]),
    ...(settings.dumpCapacity ? [
      {
        provide: DUMP_INLINE_CAPTURE,
        inject: [MONGO_CONNECTION, HOOK_EVENTS, ADDON_PACKAGE_REGISTRY],
        useFactory: (connection: Connection, events: MongooseHookEvents, packages: AddonPackageRegistry) =>
          new InProcessDumpCaptureAdapter(storage, connection, new DumpDatabase(connection, events),
            new FileAddonDumpTransfer(packages)),
      },
      {
        provide: CAPTURE_SITE_DUMP,
        inject: [DUMP_CHILD_CAPTURE, DUMP_INLINE_CAPTURE],
        useFactory: (child: ISiteDumpCapturePort, inline: ISiteDumpCapturePort) =>
          new CaptureSiteDumpUseCase(settings.dumpCapacity!, child, inline),
      },
      {
        provide: DUMP_CAPTURE,
        inject: [CAPTURE_SITE_DUMP],
        useFactory: (operation: ICaptureSiteDump): ISiteDumpCapturePort => ({
          capture: (siteId, options, signal) => operation.execute({
            siteId, ...(options ? { options } : {}), ...(signal ? { signal } : {}),
          }),
        }),
      },
    ] : [{ provide: DUMP_CAPTURE, useExisting: DUMP_CHILD_CAPTURE }]),
    {
      provide: DUMP_MAINTENANCE,
      inject: [REQUEST_DOCUMENT_CACHE_STORAGE, PUBLISHED_CONTENT, PUBLISHED_PAGE_CATALOG],
      useFactory: (cache: IRequestDocumentCachePort, content: FilePublishedContentAdapter,
        catalog: VerifiedPublicationCatalogAdapter) =>
        'sharedMaintenanceRoot' in settings && settings.sharedMaintenanceRoot
          ? new SharedDumpMaintenance(settings.sharedMaintenanceRoot, () => {
            cache.purge();
            content.purgePlans();
            catalog.purge();
          })
          : new DumpMaintenance(() => {
            cache.purge();
            content.purgePlans();
            catalog.purge();
          }),
    },
    {
      provide: SITE_DUMP_STORE,
      inject: [MONGO_CONNECTION, DUMP_MAINTENANCE, ADDON_PACKAGE_REGISTRY, HOOK_EVENTS, DUMP_CAPTURE],
      useFactory: (connection: Connection, maintenance: DumpMaintenance, packages: AddonPackageRegistry,
        events: MongooseHookEvents, capture: ISiteDumpCapturePort) =>
        new ProcessSiteDumpStore(
          storage, new DumpDatabase(connection, events), maintenance, new FileAddonDumpTransfer(packages), capture,
        ),
    },
    {
      provide: 'DumpRecovery',
      inject: [SITE_DUMP_STORE, MONGO_CONNECTION],
      useFactory: (store: FileSiteDumpStore, connection: Connection) => ({
        onModuleInit: async (): Promise<void> => {
          if (
            !('backgroundWork' in settings)
            || settings.backgroundWork !== false
            || ('coordinatorOnly' in settings
            && settings.coordinatorOnly === true)
          ) {
            await store.recover();
            await new InstallationDumpStore(storage, connection).recover();
          }
        },
      }),
    },
    {
      provide: SITE_DUMP_ACCESS,
      inject: 'operator' in settings ? [SITE_REPOSITORY] : [SITE_REPOSITORY, ADMIN_USER_STORE],
      useFactory: (sites: ISiteRepository, users?: IAdminUserReaderPort): ISiteDumpAccess => ({
        async requireAdministrator(siteId, actorId, actionId): Promise<SiteDumpType.Site | void> {
          let fullSiteOnly = false;

          if ('operator' in settings) {
            if (actorId !== settings.operator.operatorId || !settings.operator.platformAdministrator) {
              throw new BusinessError(BusinessErrorCode.Forbidden, 'Trusted operator required');
            }
          } else {
            const user = await users?.findById(actorId);

            if (!user?.authorization || user.blocked || !hasAdministratorGrant(user.authorization, actionId, siteId)) {
              throw new BusinessError(BusinessErrorCode.Forbidden, 'Site archive permission required');
            }
            fullSiteOnly = !user.authorization.systemAdmin;
          }
          if (!await sites.findById(siteId)) {
            throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
          }

          return fullSiteOnly ? SiteDumpType.Site : undefined;
        },
      }),
    },
    ...([
      [CREATE_SITE_DUMP, CreateSiteDumpUseCase], [LIST_SITE_DUMPS, ListSiteDumpsUseCase],
      [GET_SITE_DUMP, GetSiteDumpUseCase], [IMPORT_SITE_DUMP, ImportSiteDumpUseCase],
      [DELETE_SITE_DUMP, DeleteSiteDumpUseCase],
      [GET_DUMP_EXPORT_ITEMS, GetDumpExportItemsUseCase], [INSPECT_SITE_DUMP, InspectSiteDumpUseCase],
    ] satisfies [symbol, new (store: ISiteDumpStore, access: ISiteDumpAccess) => unknown][])
      .map(([provide, Operation]) => ({
        provide,
        inject: [SITE_DUMP_STORE, SITE_DUMP_ACCESS],
        useFactory: (store: ISiteDumpStore, access: ISiteDumpAccess) => new Operation(store, access),
      })),
    {
      provide: RESTORE_SITE_DUMP,
      inject: [SITE_DUMP_STORE, SITE_DUMP_ACCESS, HOOK_CHANGES],
      useFactory: (store: ISiteDumpStore, access: ISiteDumpAccess, hooks: IHookChangesPort) => new
      RestoreSiteDumpUseCase(store, access, hooks),
    },
  ];

  if ('adminAuth' in settings && settings.adminAuth) {
    const auth = settings.adminAuth;

    providers.push({
      provide: AdminDumpsController,
      inject: [GET_CURRENT_ADMIN_USER, CREATE_SITE_DUMP, LIST_SITE_DUMPS, GET_SITE_DUMP,
        IMPORT_SITE_DUMP, RESTORE_SITE_DUMP, DELETE_SITE_DUMP, GET_DUMP_EXPORT_ITEMS, INSPECT_SITE_DUMP,
        SITE_DUMP_STORE, DUMP_MAINTENANCE, MONGO_CONNECTION],
      useFactory: (current: IGetCurrentAdminUser, create: ICreateSiteDump, list: IListSiteDumps,
        get: IGetSiteDump, importDump: IImportSiteDump, restore: IRestoreSiteDump, remove: IDeleteSiteDump,
        exportItems: IGetDumpExportItems, inspect: IInspectSiteDump, store: FileSiteDumpStore,
        maintenance: DumpMaintenance, connection: Connection) => {
        const installation = new InstallationDumpStore(storage, connection);

        return new AdminDumpsController(auth, current, create, list, get, importDump, restore, remove, exportItems,
          inspect, {
            create: (siteId) => store.create(siteId, { type: SiteDumpType.Installation }),
            open: (filename) => installation.open(filename),
            restore: (content) => store.runInstallationOperation(() =>
              installation.restore(content, () => maintenance.failClosed())),
          });
      },
    });
  }

  return providers;
}
