import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Connection } from 'mongoose';

import { PublicMediaController } from '../../adapters/inbound/documents/http/media/public-media.controller.js';
import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import type {
  IAdminFileOperationFactory, IAdminFileOperations,
} from '../../adapters/inbound/rest/media/admin-file-operations.factory.js';
import { AdminFilesController } from '../../adapters/inbound/rest/media/admin-files.controller.js';
import {
  AdminSiteFaviconController, type IAdminSiteFaviconFactory,
} from '../../adapters/inbound/rest/media/admin-site-favicon.controller.js';
import type {
  IAdminRenderingOperationFactory,
} from '../../adapters/inbound/rest/rendering/admin-rendering-operations.factory.js';
import type {
  IAdminTemplateVariableFactory,
} from '../../adapters/inbound/rest/template-variables/admin-template-variables.controller.js';
import {
  SessionContentAccessAdapter,
} from '../../adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import {
  SessionMediaAccessAdapter,
} from '../../adapters/outbound/access/admin-users/media/session-media-access.adapter.js';
import {
  MediaReferenceUpdatesAdapter,
} from '../../adapters/outbound/media/references/media-reference-updates.adapter.js';
import { MediaUsagesAdapter } from '../../adapters/outbound/media/references/media-usages.adapter.js';
import {
  TemplateVariableMediaReferencesAdapter,
} from '../../adapters/outbound/media/references/template-variable-media-references.adapter.js';
import { AssetInspectionAdapter } from '../../adapters/outbound/media/sharp/asset-inspection.adapter.js';
import { SharpImageProcessingAdapter } from '../../adapters/outbound/media/sharp/image-processing.adapter.js';
import {
  assetModel,
  MongooseAssetRepository,
} from '../../adapters/outbound/persistence/mongoose/media/asset.repository.js';
import {
  mediaLibraryModel,
  MongooseFileLibraryStore,
} from '../../adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import { MediaImageRemovalAdapter } from '../../adapters/outbound/persistence/mongoose/media/image-removal.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  PageMediaReferencesAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-media-references.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import {
  PublicationMediaReferencesAdapter,
} from '../../adapters/outbound/persistence/mongoose/publication/media-references.adapter.js';
import { publicationModels } from '../../adapters/outbound/persistence/mongoose/publication/publication.models.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import {
  MediaAddressReleaseBuildAdapter,
} from '../../adapters/outbound/publication/files/media-address-release-build.adapter.js';
import { RenderingMediaReferencesAdapter } from '../../adapters/outbound/rendering/modx/media-references.adapter.js';
import { FileAssetStorageAdapter } from '../../adapters/outbound/storage/files/media/asset-storage.adapter.js';
import {
  FileLibraryProjectionAdapter,
} from '../../adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { FileSiteFaviconStore } from '../../adapters/outbound/storage/files/media/site-favicon-store.adapter.js';
import { BrowseMediaFolderUseCase } from '../../app/use-cases/media/browse-media-folder.use-case.js';
import { ReadPublicMediaUseCase } from '../../app/use-cases/media/read-public-media.use-case.js';
import {
  PublishMediaAddressReleaseUseCase,
} from '../../app/use-cases/publication/publish-media-address-release.use-case.js';
import { hasWholeSiteActionGrant } from '../../domain/authorization/admin-authorization.js';
import { resolveContentAccess } from '../../domain/authorization/content-access.js';
import { type IMediaUsageTarget, MediaUsageTargetKind } from '../../domain/media/file-library.js';
import { TemplateSourceKind } from '../../domain/publication/render-plan.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ISiteFaviconOperations } from '../../ports/inbound/media/site-favicon.port.js';
import type { IListPages } from '../../ports/inbound/pages/list-pages.port.js';
import type {
  IRewritePageMediaReferences,
} from '../../ports/inbound/pages/rewrite-page-media-references.port.js';
import type {
  IPublishMediaAddressRelease,
} from '../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IRenderingOperations } from '../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IResolveSite } from '../../ports/inbound/sites/resolve-site.port.js';
import type { ITemplateVariableOperations } from '../../ports/inbound/template-variables/template-variables.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IAssetRepository } from '../../ports/outbound/media/asset.repository.js';
import type { IAssetAccessPort } from '../../ports/outbound/media/asset-access.port.js';
import type { IAssetInspectionPort } from '../../ports/outbound/media/asset-inspection.port.js';
import type { IAssetStoragePort } from '../../ports/outbound/media/asset-storage.port.js';
import type { IAssetValuesPort } from '../../ports/outbound/media/asset-values.port.js';
import type {
  IMediaLibraryProjection,
  IMediaLibraryStore,
  IMediaUsages,
} from '../../ports/outbound/media/file-library.port.js';
import type { IImageProcessingPort } from '../../ports/outbound/media/image-processing.port.js';
import type { ISiteFaviconStore } from '../../ports/outbound/media/site-favicon-store.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { IRenderingSourcePort } from '../../ports/outbound/publication/rendering-source.port.js';
import type { IRequestDocumentCachePort } from '../../ports/outbound/publication/request-document-cache.port.js';
import type { ITemplateVariableStore } from '../../ports/outbound/template-variables/template-variables.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { REWRITE_PAGE_MEDIA_REFERENCES } from '../pages/pages.tokens.js';
import { LIST_PAGES } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { REQUEST_DOCUMENT_CACHE_STORAGE } from '../publication/publication.tokens.js';
import { PUBLISH_MEDIA_ADDRESS_RELEASE, RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { PUBLICATION_STORE, RENDERING_SOURCE } from '../publication/publication.tokens.js';
import {
  ADMIN_RENDERING_OPERATIONS, LIST_RENDERING_ELEMENTS, UPDATE_RENDERING_ELEMENT,
} from '../rendering/rendering.tokens.js';
import { RESOLVE_SITE } from '../sites/sites.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import { ADMIN_TV_OPERATIONS, TV_OPERATIONS, TV_STORE } from '../template-variables/template-variables.tokens.js';
import { addonFileReferences } from './addon-file-references.factory.js';
import { fileLibraryOperations } from './file-library-operations.factory.js';
import { ADMIN_SITE_FAVICON_OPERATIONS, SITE_FAVICON_OPERATIONS, SITE_FAVICON_STORE } from './media.tokens.js';
import {
  ADMIN_FILE_OPERATIONS, ASSET_ACCESS, ASSET_INSPECTION, ASSET_REPOSITORY, ASSET_STORAGE, ASSET_VALUES,
  FILE_LIBRARY_OPERATIONS, FILE_LIBRARY_PROJECTION, FILE_LIBRARY_STORE, FILE_LIBRARY_USAGES, IMAGE_PROCESSING,
} from './media.tokens.js';
import { siteFaviconOperations } from './site-favicon-operations.factory.js';

function libraryPersistenceProviders(media: { readonly root: string }): Provider[] {
  return [
    {
      provide: SITE_FAVICON_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new FileSiteFaviconStore(media.root,
        new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    {
      provide: FILE_LIBRARY_PROJECTION,
      inject: [ASSET_STORAGE, MONGO_CONNECTION],
      useFactory: (storage: IAssetStoragePort, connection: Connection) =>
        new FileLibraryProjectionAdapter(media.root, storage,
          new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    {
      provide: FILE_LIBRARY_STORE,
      inject: [MONGO_CONNECTION, FILE_LIBRARY_PROJECTION, ASSET_STORAGE, ModuleRef],
      useFactory: (connection: Connection, projection: IMediaLibraryProjection,
        storage: IAssetStoragePort, ref: ModuleRef) => {
        const removal = new MediaImageRemovalAdapter(assetModel(connection), storage);

        return new MongooseFileLibraryStore(mediaLibraryModel(connection), projection, removal,
          addonFileReferences(connection, ref));
      },
    },
    {
      provide: FILE_LIBRARY_USAGES,
      inject: [MONGO_CONNECTION, RENDERING_SOURCE, PUBLICATION_STORE, TV_STORE, ModuleRef],
      useFactory: (connection: Connection, sources: IRenderingSourcePort, artifacts: IPublicationArtifactSourcePort,
        variables: ITemplateVariableStore, ref: ModuleRef) =>
        new MediaUsagesAdapter([
          new PageMediaReferencesAdapter(connection.model<IPageRecord>('Page', pageSchema),
            connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema)),
          new RenderingMediaReferencesAdapter(sources),
          new TemplateVariableMediaReferencesAdapter(variables),
          new PublicationMediaReferencesAdapter(publicationModels(connection).releases, artifacts),
        ], addonFileReferences(connection, ref)),
    },
  ];
}

export function mediaDeliveryProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.media) {
    return [];
  }

  const media = settings.media;

  return [{
    provide: PublicMediaController,
    inject: [MONGO_CONNECTION, RESOLVE_SITE],
    useFactory: (connection: Connection, sites: IResolveSite) => {
      const scope = new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema));
      const storage = new FileAssetStorageAdapter(media.root, media.publicBaseUrl, scope);
      const projection = new FileLibraryProjectionAdapter(media.root, storage, scope);
      const removal = new MediaImageRemovalAdapter(assetModel(connection), storage);
      const store = new MongooseFileLibraryStore(mediaLibraryModel(connection), projection, removal);
      const read = new ReadPublicMediaUseCase(sites, store, storage, media.publicBaseUrl,
        new FileSiteFaviconStore(media.root, scope));

      return new PublicMediaController(read, media.publicBaseUrl);
    },
  }];
}

export function localFileLibraryProviders(settings: ILocalApplicationSettings): Provider[] {
  if (!settings.media) {
    return [];
  }

  const media = settings.media;

  return [
    ...libraryPersistenceProviders(media),
    {
      provide: SITE_FAVICON_OPERATIONS,
      inject: [SITE_FAVICON_STORE, ASSET_ACCESS, ASSET_INSPECTION, PUBLISH_MEDIA_ADDRESS_RELEASE],
      useFactory: (store: ISiteFaviconStore, access: IAssetAccessPort, inspection: IAssetInspectionPort,
        publication: IPublishMediaAddressRelease) =>
        siteFaviconOperations(store, { requireEditor: (siteId) => access.requireProcessing(siteId) }, inspection, {
          execute: (input) => publication.execute({ ...input, actorId: settings.operator.operatorId }),
        }),
    },
    {
      provide: FILE_LIBRARY_OPERATIONS,
      inject: [FILE_LIBRARY_STORE, FILE_LIBRARY_USAGES, ASSET_REPOSITORY, ASSET_STORAGE, ASSET_INSPECTION,
        IMAGE_PROCESSING, ASSET_VALUES, ASSET_ACCESS, LIST_PAGES, GET_SITE, REWRITE_PAGE_MEDIA_REFERENCES,
        ...(settings.rendering ? [PUBLISH_MEDIA_ADDRESS_RELEASE] : []),
        ...(settings.rendering ? [LIST_RENDERING_ELEMENTS, UPDATE_RENDERING_ELEMENT, TV_OPERATIONS] : [])],
      useFactory: (store: IMediaLibraryStore, usages: IMediaUsages,
        assets: IAssetRepository, storage: IAssetStoragePort,
        inspection: IAssetInspectionPort, images: IImageProcessingPort,
        values: IAssetValuesPort, access: IAssetAccessPort, pages: IListPages, sites: IGetSite,
        pageReferences: IRewritePageMediaReferences,
        publication?: IPublishMediaAddressRelease,
        list?: IRenderingOperations['list'], update?: IRenderingOperations['update'],
        variables?: ITemplateVariableOperations) => fileLibraryOperations(store, {
        actorId: async () => settings.operator.operatorId,
        requireEditor: async (siteId) => {
          await access.requireProcessing(siteId);
        },
        requirePermission: (siteId, actorId, permission) => access.requirePermission(siteId, actorId, permission),
        requireProcessing: (siteId) => access.requireProcessing(siteId),
      }, { nextId: randomUUID, publicPath: media.publicBaseUrl }, usages, assets, storage, inspection, images, values,
      list && update && variables
        ? new MediaReferenceUpdatesAdapter({ list, update }, variables, pages, sites, pageReferences) : undefined,
      publication ? {
        execute: (input) => publication.execute({ ...input, actorId: settings.operator.operatorId }),
      } : undefined),
    },
  ];
}

export function fileLibraryHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth || !settings.media) {
    return [];
  }

  const media = settings.media;
  const auth = settings.adminAuth;

  return [
    {
      provide: ASSET_REPOSITORY,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseAssetRepository(assetModel(connection)),
    },
    {
      provide: ASSET_STORAGE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new FileAssetStorageAdapter(media.root, media.publicBaseUrl,
          new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    { provide: ASSET_INSPECTION, useFactory: () => new AssetInspectionAdapter() },
    { provide: IMAGE_PROCESSING, useFactory: () => new SharpImageProcessingAdapter() },
    {
      provide: ASSET_VALUES,
      useValue: {
        nextId: randomUUID,
        nextAssetVersion: randomUUID,
        nextMetadataVersion: randomUUID,
        now: () => new Date(),
      },
    },
    ...libraryPersistenceProviders(media),
    {
      provide: ADMIN_SITE_FAVICON_OPERATIONS,
      inject: [SITE_FAVICON_STORE, ASSET_INSPECTION, GET_CURRENT_ADMIN_USER, ADMIN_CONTENT_OPERATIONS,
        PUBLICATION_STORE, RELEASE_ACTIVATION, HOOK_CHANGES, REQUEST_DOCUMENT_CACHE_STORAGE],
      useFactory: (store: ISiteFaviconStore, inspection: IAssetInspectionPort, current: IGetCurrentAdminUser,
        content: IAdminContentOperationFactory,
        publicationStore: IPublicationStorePort & IPublicationArtifactSourcePort,
        activation: IReleaseActivationPort, hooks: IHookChangesPort, cache: IRequestDocumentCachePort):
      IAdminSiteFaviconFactory => ({
        forSession(token): ISiteFaviconOperations {
          const access = new SessionMediaAccessAdapter(current, token, content.forSession(token).getSite);
          const publication = new PublishMediaAddressReleaseUseCase(new SessionContentAccessAdapter(current, token),
            content.forSession(token).getSite, activation, publicationStore,
            new MediaAddressReleaseBuildAdapter(publicationStore), { nextReleaseId: randomUUID, now: () => new Date() },
            {
              prepare: async (input) => hooks.prepare({
                ...input, actorId: (await current.execute({ token })).user.adminUserId,
              }),
            }, cache);

          return siteFaviconOperations(store, access, inspection, {
            execute: async (input) => publication.execute({ ...input, actorId: await access.actorId() }),
          });
        },
      }),
    },
    {
      provide: AdminSiteFaviconController,
      inject: [ADMIN_SITE_FAVICON_OPERATIONS],
      useFactory: (operations: IAdminSiteFaviconFactory) => new AdminSiteFaviconController(auth, operations),
    },
    {
      provide: ADMIN_FILE_OPERATIONS,
      inject: [FILE_LIBRARY_STORE, FILE_LIBRARY_USAGES, ASSET_REPOSITORY,
        ASSET_STORAGE, ASSET_INSPECTION, IMAGE_PROCESSING, ASSET_VALUES,
        GET_CURRENT_ADMIN_USER, ADMIN_CONTENT_OPERATIONS, ADMIN_RENDERING_OPERATIONS, ADMIN_TV_OPERATIONS,
        PUBLICATION_STORE, RELEASE_ACTIVATION, HOOK_CHANGES, REQUEST_DOCUMENT_CACHE_STORAGE],
      useFactory: (store: IMediaLibraryStore, usages: IMediaUsages,
        assets: IAssetRepository, storage: IAssetStoragePort,
        inspection: IAssetInspectionPort, images: IImageProcessingPort, values: IAssetValuesPort,
        current: IGetCurrentAdminUser, content: IAdminContentOperationFactory,
        rendering: IAdminRenderingOperationFactory, variables: IAdminTemplateVariableFactory,
        publicationStore: IPublicationStorePort & IPublicationArtifactSourcePort, activation: IReleaseActivationPort,
        hooks: IHookChangesPort, cache: IRequestDocumentCachePort):
      IAdminFileOperationFactory => ({
        forSession(token): IAdminFileOperations {
          const contentOperations = content.forSession(token);
          const renderingOperations = rendering.forSession(token);
          const access = new SessionMediaAccessAdapter(current, token, contentOperations.getSite);
          const publication = new PublishMediaAddressReleaseUseCase(new SessionContentAccessAdapter(current, token),
            content.forSession(token).getSite, activation, publicationStore,
            new MediaAddressReleaseBuildAdapter(publicationStore), { nextReleaseId: randomUUID, now: () => new Date() },
            {
              prepare: async (input) => hooks.prepare({
                ...input,
                actorId: (await current.execute({ token })).user.adminUserId,
              }),
            }, cache);

          return {
            ...fileLibraryOperations(store, access, { nextId: randomUUID, publicPath: media.publicBaseUrl },
              usages, assets, storage, inspection, images, values,
              new MediaReferenceUpdatesAdapter(renderingOperations, variables.forSession(token),
                contentOperations.listPages, contentOperations.getSite, contentOperations.rewritePageMedia), {
                execute: async (input) => publication.execute({ ...input, actorId: await access.actorId() }),
              }),
            browse: new BrowseMediaFolderUseCase(store, { requireEditor: (siteId) => access.requireList(siteId) },
              { nextId: randomUUID, publicPath: media.publicBaseUrl },
              async (siteId) => (await contentOperations.getSite.execute({ siteId }))?.timeZone ?? 'UTC'),
            async readableUsageTargets(siteId: string, targets: readonly IMediaUsageTarget[]):
            Promise<ReadonlySet<string>> {
              if (!targets.length) {
                return new Set<string>();
              }

              const { user } = await current.execute({ token });
              const actor = user.authorization;
              const readScope = (action: string): ReturnType<typeof resolveContentAccess> =>
                resolveContentAccess(actor, user.adminUserId, siteId, action);
              const kinds = new Set(targets.map((target) => target.kind));
              const pageRead = kinds.has(MediaUsageTargetKind.Page) ? readScope('cms.pages.read') : undefined;
              const sourceKinds = [
                [MediaUsageTargetKind.Template, TemplateSourceKind.Template, 'cms.templates.read'],
                [MediaUsageTargetKind.Chunk, TemplateSourceKind.Chunk, 'cms.chunks.read'],
                [MediaUsageTargetKind.Snippet, TemplateSourceKind.Snippet, 'cms.snippets.read'],
              ] as const;
              const [pages, ...elements] = await Promise.all([
                pageRead ? contentOperations.listPages.execute({ siteId, authority: pageRead }) : [],
                ...sourceKinds.filter(([kind]) => kinds.has(kind)).map(async ([targetKind, kind, action]) => {
                  const authority = readScope(action);

                  if (!authority && !hasWholeSiteActionGrant(actor, action, siteId)) {
                    return [];
                  }

                  const sources = await renderingOperations.list.execute({
                    siteId, kind, ...(authority ? { authority } : {}),
                  });

                  return sources.map((source) => targetKind + ':' + source.key);
                }),
              ]);
              const readable = new Set([...pages.map((page) => MediaUsageTargetKind.Page + ':' + page.pageId),
                ...elements.flat()]);

              if (hasWholeSiteActionGrant(actor, 'cms.template-variables.list', siteId)) {
                for (const target of targets.filter(({ kind }) => kind === MediaUsageTargetKind.TemplateVariable)) {
                  readable.add(target.kind + ':' + target.id);
                }
              }
              if (hasWholeSiteActionGrant(actor, 'cms.addons.read', siteId)) {
                for (const target of targets.filter(({ kind }) => kind === MediaUsageTargetKind.Addon)) {
                  readable.add(target.kind + ':' + target.id);
                }
              }

              return readable;
            },
          };
        },
      }),
    },
    {
      provide: AdminFilesController,
      inject: [ADMIN_FILE_OPERATIONS],
      useFactory: (operations: IAdminFileOperationFactory) => new AdminFilesController(auth, operations),
    },
  ];
}
