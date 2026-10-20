import type { DynamicModule, ModuleMetadata, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { PageLifecycleValuesAdapter } from '../../adapters/outbound/system/pages/page-lifecycle-values.adapter.js';
import { PageRelationshipsService } from '../../app/services/pages/page-relationships.service.js';
import { PageScopeService } from '../../app/services/pages/page-scope.service.js';
import { ArchivePageUseCase } from '../../app/use-cases/pages/archive-page.use-case.js';
import { AssignPageToClusterUseCase } from '../../app/use-cases/pages/assign-page-to-cluster.use-case.js';
import { CreatePageUseCase } from '../../app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../../app/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../../app/use-cases/pages/list-pages.use-case.js';
import { PublishPageUseCase } from '../../app/use-cases/pages/publish-page.use-case.js';
import { UpdatePageUseCase } from '../../app/use-cases/pages/update-page.use-case.js';
import type { IClusterLookupPort } from '../../ports/outbound/pages/cluster-lookup.port.js';
import type { IPageRepository } from '../../ports/outbound/pages/page.repository.js';
import type { IPageLifecycleValues } from '../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { ISiteLookupPort } from '../../ports/outbound/pages/site-lookup.port.js';
import {
  ARCHIVE_PAGE,
  ASSIGN_PAGE_TO_CLUSTER,
  CLUSTER_LOOKUP_PORT,
  CREATE_PAGE,
  GET_PAGE,
  LIST_PAGES,
  PAGE_LIFECYCLE_VALUES,
  PAGE_REPOSITORY,
  PUBLISH_PAGE,
  SITE_LOOKUP_PORT,
  UPDATE_PAGE,
} from './pages.tokens.js';

export interface IPagesModuleOptions {
  repository: Provider<IPageRepository>;
  siteLookup: Provider<ISiteLookupPort>;
  clusterLookup: Provider<IClusterLookupPort>;
  imports?: ModuleMetadata['imports'];
}

@Module({})
export class PagesModule {
  static register(options: IPagesModuleOptions): DynamicModule {
    if (typeof options.repository === 'function' || options.repository.provide !== PAGE_REPOSITORY) {
      throw new TypeError('The page repository provider must use PAGE_REPOSITORY');
    }
    if (typeof options.siteLookup === 'function' || options.siteLookup.provide !== SITE_LOOKUP_PORT) {
      throw new TypeError('The site lookup provider must use SITE_LOOKUP_PORT');
    }
    if (typeof options.clusterLookup === 'function' || options.clusterLookup.provide !== CLUSTER_LOOKUP_PORT) {
      throw new TypeError('The cluster lookup provider must use CLUSTER_LOOKUP_PORT');
    }

    return {
      module: PagesModule,
      imports: options.imports ?? [],
      providers: [
        options.repository,
        options.siteLookup,
        options.clusterLookup,
        { provide: PAGE_LIFECYCLE_VALUES, useClass: PageLifecycleValuesAdapter },
        {
          provide: PageScopeService,
          inject: [PAGE_REPOSITORY],
          useFactory: (pages: IPageRepository): PageScopeService => new PageScopeService(pages),
        },
        {
          provide: PageRelationshipsService,
          inject: [SITE_LOOKUP_PORT, CLUSTER_LOOKUP_PORT],
          useFactory: (sites: ISiteLookupPort, clusters: IClusterLookupPort): PageRelationshipsService =>
            new PageRelationshipsService(sites, clusters),
        },
        {
          provide: CREATE_PAGE,
          inject: [PAGE_REPOSITORY, PageRelationshipsService, PAGE_LIFECYCLE_VALUES],
          useFactory: (
            pages: IPageRepository,
            relationships: PageRelationshipsService,
            values: IPageLifecycleValues,
          ): CreatePageUseCase => new CreatePageUseCase(pages, relationships, values),
        },
        {
          provide: UPDATE_PAGE,
          inject: [PAGE_REPOSITORY, PageScopeService],
          useFactory: (pages: IPageRepository, scope: PageScopeService): UpdatePageUseCase =>
            new UpdatePageUseCase(pages, scope),
        },
        {
          provide: ASSIGN_PAGE_TO_CLUSTER,
          inject: [PAGE_REPOSITORY, PageScopeService, PageRelationshipsService],
          useFactory: (
            pages: IPageRepository,
            scope: PageScopeService,
            relationships: PageRelationshipsService,
          ): AssignPageToClusterUseCase => new AssignPageToClusterUseCase(pages, scope, relationships),
        },
        {
          provide: PUBLISH_PAGE,
          inject: [PAGE_REPOSITORY, PageScopeService, PAGE_LIFECYCLE_VALUES],
          useFactory: (
            pages: IPageRepository,
            scope: PageScopeService,
            values: IPageLifecycleValues,
          ): PublishPageUseCase => new PublishPageUseCase(pages, scope, values),
        },
        {
          provide: ARCHIVE_PAGE,
          inject: [PAGE_REPOSITORY, PageScopeService],
          useFactory: (pages: IPageRepository, scope: PageScopeService): ArchivePageUseCase =>
            new ArchivePageUseCase(pages, scope),
        },
        {
          provide: GET_PAGE,
          inject: [PAGE_REPOSITORY],
          useFactory: (pages: IPageRepository): GetPageUseCase => new GetPageUseCase(pages),
        },
        {
          provide: LIST_PAGES,
          inject: [PAGE_REPOSITORY],
          useFactory: (pages: IPageRepository): ListPagesUseCase => new ListPagesUseCase(pages),
        },
      ],
      exports: [CREATE_PAGE, UPDATE_PAGE, ASSIGN_PAGE_TO_CLUSTER, PUBLISH_PAGE, ARCHIVE_PAGE, GET_PAGE, LIST_PAGES],
    };
  }
}
