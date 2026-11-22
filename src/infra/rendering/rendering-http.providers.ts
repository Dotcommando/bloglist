import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { AdminPreviewController } from '../../adapters/inbound/documents/http/rendering/admin-preview.controller.js';
import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import { AdminRenderingController } from '../../adapters/inbound/rest/rendering/admin-rendering.controller.js';
import type {
  IAdminRenderingOperationFactory, IAdminRenderingOperations,
} from '../../adapters/inbound/rest/rendering/admin-rendering-operations.factory.js';
import {
  SessionContentAccessAdapter,
} from '../../adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageContentSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-content-source.adapter.js';
import {
  type IPagePublicationsRecord, pagePublicationsSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import { createRoutingModels } from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseRoutingSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/routing/routing-source.adapter.js';
import { PageReleaseBuildAdapter } from '../../adapters/outbound/publication/files/page-release-build.adapter.js';
import { PublicationSourceAdapter } from '../../adapters/outbound/publication/files/publication-source.adapter.js';
import { PublishedRoutingAdapter } from '../../adapters/outbound/publication/files/published-routing.adapter.js';
import { AdminPreviewCache } from '../../adapters/outbound/publication/memory/admin-preview.adapter.js';
import { BasicRenderingSourceAdapter } from '../../adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import {
  FileFrontendSourceLocationsAdapter,
} from '../../adapters/outbound/rendering/files/frontend-source-locations.adapter.js';
import {
  ManagedRenderingSourceAdapter,
} from '../../adapters/outbound/rendering/files/managed-rendering-source.adapter.js';
import { FileRenderingSourceAdapter } from '../../adapters/outbound/rendering/files/rendering-source.adapter.js';
import { JsonLdInspectionAdapter } from '../../adapters/outbound/rendering/html/json-ld-inspection.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { RenderingElementUsagesAdapter } from '../../adapters/outbound/rendering/modx/element-usages.adapter.js';
import { FrontendBuildAdapter } from '../../adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { JsonLdPublicationSourceService } from '../../app/services/json-ld/json-ld-publication-source.service.js';
import type { IRenderRuntime } from '../../app/services/publication/render-data.service.js';
import {
  TemplateVariableSourceService,
} from '../../app/services/template-variables/template-variable-source.service.js';
import { InspectJsonLdDraftUseCase } from '../../app/use-cases/json-ld/inspect-json-ld-draft.use-case.js';
import { InspectJsonLdPublishedUseCase } from '../../app/use-cases/json-ld/inspect-json-ld-published.use-case.js';
import { PreviewMarkdownDraftUseCase } from '../../app/use-cases/publication/preview-markdown-draft.use-case.js';
import {
  PreviewMarkdownPublishedUseCase,
} from '../../app/use-cases/publication/preview-markdown-published.use-case.js';
import { PreviewPageUseCase } from '../../app/use-cases/publication/preview-page.use-case.js';
import { RepublishSnippetPagesUseCase } from '../../app/use-cases/publication/republish-snippet-pages.use-case.js';
import { ReadRenderingPreviewUseCase } from '../../app/use-cases/rendering/read-rendering-preview.use-case.js';
import { canReadRenderingPreview, hasWholeSiteActionGrant } from '../../domain/authorization/admin-authorization.js';
import { resolveContentAccess } from '../../domain/authorization/content-access.js';
import { Page } from '../../domain/pages/page.js';
import { TemplateSourceKind } from '../../domain/publication/render-plan.js';
import { ElementUsageKind } from '../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IGetPublishedArtifact } from '../../ports/inbound/publication/get-published-artifact.port.js';
import type { IRenderPublishedPage } from '../../ports/inbound/publication/render-published-page.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IJsonLdCatalogReader } from '../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { IPublicArtifactPort } from '../../ports/outbound/publication/public-artifact.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { IRenderingSourcePort } from '../../ports/outbound/publication/rendering-source.port.js';
import type { ITemplateCompositionPort } from '../../ports/outbound/publication/template-composition.port.js';
import type { IElementKeys } from '../../ports/outbound/rendering/element-keys.port.js';
import type {
  IElementBackup, IElementCatalog, IElementValues,
} from '../../ports/outbound/rendering/element-sources.port.js';
import type { IElementStore } from '../../ports/outbound/rendering/element-store.port.js';
import type {
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../ports/outbound/template-variables/template-variables.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { JSON_LD_CATALOG_READER } from '../json-ld/json-ld.tokens.js';
import { jsonLdReleaseProjection } from '../json-ld/json-ld-release.factory.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import {
  GET_PUBLISHED_ARTIFACT, PUBLICATION_STORE, PUBLISHED_CONTENT, RELEASE_ACTIVATION, RENDER_PUBLISHED_PAGE,
} from '../publication/publication.tokens.js';
import { COMPOSITION, RENDER_RUNTIME, RENDERING_SOURCE } from '../publication/publication.tokens.js';
import { TV_PUBLICATION, TV_STORE } from '../template-variables/template-variables.tokens.js';
import {
  ADMIN_PREVIEWS, ADMIN_RENDERING_OPERATIONS, ELEMENT_BACKUP, ELEMENT_CATALOG,
  ELEMENT_KEYS, ELEMENT_STORE, ELEMENT_VALUES,
} from './rendering.tokens.js';
import { renderingAdapterProviders } from './rendering-adapters.providers.js';
import { renderingOperations } from './rendering-use-cases.providers.js';

export function renderingHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;
  const root = settings.sourcesRoot ?? path.resolve('sites');

  return [
    ...renderingAdapterProviders(root),
    { provide: ADMIN_PREVIEWS, useFactory: () => new AdminPreviewCache() },
    {
      provide: RENDERING_SOURCE,
      inject: [ELEMENT_STORE],
      useFactory: (store: IElementStore) =>
        new ManagedRenderingSourceAdapter(store,
          new FileRenderingSourceAdapter(root, new BasicRenderingSourceAdapter())),
    },
    {
      provide: ADMIN_RENDERING_OPERATIONS,
      inject: [MONGO_CONNECTION, ADMIN_CONTENT_OPERATIONS, GET_CURRENT_ADMIN_USER, ELEMENT_STORE,
        ELEMENT_CATALOG, ELEMENT_BACKUP, ELEMENT_VALUES, RENDERING_SOURCE, COMPOSITION, RENDER_RUNTIME,
        ADMIN_PREVIEWS, ELEMENT_KEYS, HOOK_CHANGES, TV_PUBLICATION, TV_STORE, PUBLICATION_STORE, RELEASE_ACTIVATION,
        RENDER_PUBLISHED_PAGE, GET_PUBLISHED_ARTIFACT, JSON_LD_CATALOG_READER, PUBLISHED_CONTENT],
      useFactory: (connection: Connection, content: IAdminContentOperationFactory, current: IGetCurrentAdminUser,
        store: IElementStore, catalog: IElementCatalog, backup: IElementBackup, values: IElementValues,
        sources: IRenderingSourcePort, composition: ITemplateCompositionPort, runtime: IRenderRuntime,
        previews: AdminPreviewCache, keys: IElementKeys, hooks: IHookChangesPort,
        variables: ITemplateVariablePublication, definitions: ITemplateVariableStore,
        publicationStore: IPublicationStorePort & IPublicationArtifactSourcePort,
        activation: IReleaseActivationPort, renderPublished: IRenderPublishedPage,
        artifacts: IGetPublishedArtifact, catalogs: IJsonLdCatalogReader,
        publicFiles: IPublicArtifactPort): IAdminRenderingOperationFactory => {
        const pageSource = new MongoosePageContentSourceAdapter(connection.model<IPageRecord>('Page', pageSchema),
          connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema));
        const routing = new MongooseRoutingSourceAdapter(createRoutingModels(connection).urls);
        const frontend = new FrontendBuildAdapter(settings.media?.publicBaseUrl,
          new FileFrontendSourceLocationsAdapter(root), new MarkdownConversionAdapter());

        return {
          forSession(token): IAdminRenderingOperations {
            const operations = content.forSession(token);
            const access = new SessionContentAccessAdapter(current, token);
            const source = new JsonLdPublicationSourceService(new TemplateVariableSourceService(
              new PublicationSourceAdapter(sources, pageSource, routing, operations.getSite), variables, definitions),
            catalogs, new PublishedRoutingAdapter(activation, publicationStore, publicFiles));
            const usages = new RenderingElementUsagesAdapter(sources, operations.listPages);
            let sessionUser: ReturnType<IGetCurrentAdminUser['execute']> | undefined;
            const session = (): ReturnType<IGetCurrentAdminUser['execute']> =>
              sessionUser ??= current.execute({ token });

            async function requireReadablePage(siteId: string, pageId: string): Promise<void> {
              const { user } = await session();
              const authority = resolveContentAccess(user.authorization, user.adminUserId, siteId, 'cms.pages.read');

              if (!authority || !await operations.getPage.execute({ siteId, pageId, authority })) {
                throw new BusinessError(BusinessErrorCode.Forbidden, 'Preview requires access to the page');
              }
            }

            const reader = new ReadRenderingPreviewUseCase(previews, async (siteId, pageId) => {
              const { user } = await session();

              if (!canReadRenderingPreview(user.authorization, siteId)) {
                throw new BusinessError(BusinessErrorCode.Forbidden, 'Preview read is outside the assigned scope');
              }
              await requireReadablePage(siteId, pageId);
            });
            const elementOperations = renderingOperations(operations.getSite, catalog, store, backup, values,
              usages, {
                execute: async (input) => {
                  await requireReadablePage(input.siteId, input.pageId);
                  const actorId = (await session()).user.adminUserId;
                  const preview = new PreviewPageUseCase(access, source, composition, runtime, frontend,
                    { present: (document, build) => previews.present(input.siteId, actorId, document, build) },
                    { nextReleaseId: randomUUID, now: () => new Date() });

                  return preview.execute({ ...input, actorId });
                },
              }, keys, {
                prepare: async (change) => hooks.prepare({
                  ...change,
                  actorId: (await current.execute({ token })).user.adminUserId,
                }),
              }, new RepublishSnippetPagesUseCase(new RenderingElementUsagesAdapter(sources,
                {
                  execute: async (input) => (await pageSource.readPublished(input.siteId))
                    .map((page) => new Page(page)),
                }),
              source, composition, runtime,
              new PageReleaseBuildAdapter(frontend, publicationStore, jsonLdReleaseProjection()), publicationStore,
              activation, { nextReleaseId: randomUUID, now: () => new Date() }, hooks));

            return {
              ...elementOperations,
              get: {
                execute: async (input) => {
                  const element = await elementOperations.get.execute(input);

                  if (!element.usages.length) {
                    return element;
                  }

                  const { user } = await session();
                  const { siteId } = input;
                  const kinds = new Set(element.usages.map((usage) => usage.kind));
                  const pageRead = kinds.has(ElementUsageKind.Page)
                    ? resolveContentAccess(user.authorization, user.adminUserId, siteId, 'cms.pages.read') : undefined;
                  const chunkRead = kinds.has(ElementUsageKind.Chunk)
                    ? resolveContentAccess(user.authorization, user.adminUserId, siteId, 'cms.chunks.read') : undefined;
                  const templateRead = hasWholeSiteActionGrant(user.authorization, 'cms.templates.read', siteId);
                  const allPages = pageRead?.scopes.includes('all');
                  const allChunks = chunkRead?.scopes.includes('all');
                  const [pages, chunks] = await Promise.all([
                    pageRead && !allPages ? operations.listPages.execute({ siteId, authority: pageRead }) : [],
                    chunkRead && !allChunks ? elementOperations.list.execute({
                      siteId, kind: TemplateSourceKind.Chunk, authority: chunkRead,
                    }) : [],
                  ]);
                  const pageIds = new Set(pages.map((page) => page.pageId));
                  const chunkKeys = new Set(chunks.map((chunk) => chunk.key));

                  return {
                    ...element,
                    usages: element.usages.map((usage) => {
                      const readable = usage.kind === ElementUsageKind.Page ? allPages || pageIds.has(usage.id)
                        : usage.kind === ElementUsageKind.Chunk ? allChunks || chunkKeys.has(usage.id) : templateRead;

                      return readable ? { ...usage, readable: true } : usage;
                    }),
                  };
                },
              },
              inspectJsonLdDraft: {
                execute: async (input) => new InspectJsonLdDraftUseCase(access, source, composition, runtime).execute({
                  ...input, actorId: (await current.execute({ token })).user.adminUserId,
                }),
              },
              inspectJsonLdPublished: {
                execute: async (input) => new InspectJsonLdPublishedUseCase(access, activation, publicationStore,
                  renderPublished, artifacts, new JsonLdInspectionAdapter()).execute({
                  ...input, actorId: (await current.execute({ token })).user.adminUserId,
                }),
              },
              previewMarkdownPublished: {
                execute: async (input) => new PreviewMarkdownPublishedUseCase(access, activation, publicationStore,
                  renderPublished, artifacts).execute({
                  ...input, actorId: (await current.execute({ token })).user.adminUserId,
                }),
              },
              previewMarkdownDraft: {
                execute: async (input) => new PreviewMarkdownDraftUseCase(
                  access, source, composition, runtime, frontend,
                  { nextReleaseId: randomUUID, now: () => new Date() }).execute({
                  ...input, actorId: (await current.execute({ token })).user.adminUserId,
                }),
              },
              readPreview: {
                execute: async (previewId) => reader.execute({
                  previewId, actorId: (await current.execute({ token })).user.adminUserId,
                }),
              },
            };
          },
        };
      },
    },
    {
      provide: AdminRenderingController,
      inject: [ADMIN_RENDERING_OPERATIONS],
      useFactory: (operations: IAdminRenderingOperationFactory) => new AdminRenderingController(auth, operations),
    },
    {
      provide: AdminPreviewController,
      inject: [ADMIN_RENDERING_OPERATIONS],
      useFactory: (operations: IAdminRenderingOperationFactory) => new AdminPreviewController(auth, operations),
    },
  ];
}
