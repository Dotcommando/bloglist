import type { DynamicModule, ModuleMetadata, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

import {
  ClusterBlogCreationValuesAdapter,
} from '../../adapters/outbound/system/clusters/cluster-blog-creation-values.adapter.js';
import {
  ClusterCreationValuesAdapter,
} from '../../adapters/outbound/system/clusters/cluster-creation-values.adapter.js';
import {
  ClusterBlogPlacementScopeService,
} from '../../app/services/clusters/cluster-blog-placement-scope.service.js';
import { ClusterScopeService } from '../../app/services/clusters/cluster-scope.service.js';
import { AddBlogToClusterUseCase } from '../../app/use-cases/clusters/add-blog-to-cluster.use-case.js';
import { ArchiveClusterUseCase } from '../../app/use-cases/clusters/archive-cluster.use-case.js';
import { CreateClusterUseCase } from '../../app/use-cases/clusters/create-cluster.use-case.js';
import { GetClusterUseCase } from '../../app/use-cases/clusters/get-cluster.use-case.js';
import { ListClustersUseCase } from '../../app/use-cases/clusters/list-clusters.use-case.js';
import { MoveClusterUseCase } from '../../app/use-cases/clusters/move-cluster.use-case.js';
import { RemoveBlogFromClusterUseCase } from '../../app/use-cases/clusters/remove-blog-from-cluster.use-case.js';
import { ReorderClusterBlogsUseCase } from '../../app/use-cases/clusters/reorder-cluster-blogs.use-case.js';
import { UpdateClusterUseCase } from '../../app/use-cases/clusters/update-cluster.use-case.js';
import {
  UpdateClusterBlogPlacementUseCase,
} from '../../app/use-cases/clusters/update-cluster-blog-placement.use-case.js';
import type { IBlogLookupPort } from '../../ports/outbound/clusters/blog-lookup.port.js';
import type { IClusterRepository } from '../../ports/outbound/clusters/cluster.repository.js';
import type { IClusterBlogRepository } from '../../ports/outbound/clusters/cluster-blog.repository.js';
import type { IClusterBlogCreationValues } from '../../ports/outbound/clusters/cluster-blog-creation-values.port.js';
import type { IClusterCreationValues } from '../../ports/outbound/clusters/cluster-creation-values.port.js';
import type { ISiteLookupPort } from '../../ports/outbound/clusters/site-lookup.port.js';
import {
  ADD_BLOG_TO_CLUSTER,
  ARCHIVE_CLUSTER,
  BLOG_LOOKUP_PORT,
  CLUSTER_BLOG_CREATION_VALUES,
  CLUSTER_BLOG_REPOSITORY,
  CLUSTER_CREATION_VALUES,
  CLUSTER_REPOSITORY,
  CREATE_CLUSTER,
  GET_CLUSTER,
  LIST_CLUSTERS,
  MOVE_CLUSTER,
  REMOVE_BLOG_FROM_CLUSTER,
  REORDER_CLUSTER_BLOGS,
  SITE_LOOKUP_PORT,
  UPDATE_CLUSTER,
  UPDATE_CLUSTER_BLOG_PLACEMENT,
} from './clusters.tokens.js';

export interface IClustersModuleOptions {
  repository: Provider<IClusterRepository>;
  siteLookup: Provider<ISiteLookupPort>;
  placementRepository: Provider<IClusterBlogRepository>;
  blogLookup: Provider<IBlogLookupPort>;
  imports?: ModuleMetadata['imports'];
}

@Module({})
export class ClustersModule {
  static register(options: IClustersModuleOptions): DynamicModule {
    if (typeof options.repository === 'function' || options.repository.provide !== CLUSTER_REPOSITORY) {
      throw new TypeError('The cluster repository provider must use CLUSTER_REPOSITORY');
    }
    if (typeof options.siteLookup === 'function' || options.siteLookup.provide !== SITE_LOOKUP_PORT) {
      throw new TypeError('The site lookup provider must use SITE_LOOKUP_PORT');
    }
    if (typeof options.placementRepository === 'function'
      || options.placementRepository.provide !== CLUSTER_BLOG_REPOSITORY) {
      throw new TypeError('The placement repository provider must use CLUSTER_BLOG_REPOSITORY');
    }
    if (typeof options.blogLookup === 'function' || options.blogLookup.provide !== BLOG_LOOKUP_PORT) {
      throw new TypeError('The blog lookup provider must use BLOG_LOOKUP_PORT');
    }

    return {
      module: ClustersModule,
      imports: options.imports ?? [],
      providers: [
        options.repository,
        options.siteLookup,
        options.placementRepository,
        options.blogLookup,
        {
          provide: ClusterScopeService,
          inject: [CLUSTER_REPOSITORY],
          useFactory: (clusters: IClusterRepository): ClusterScopeService => new ClusterScopeService(clusters),
        },
        {
          provide: ClusterBlogPlacementScopeService,
          inject: [ClusterScopeService, CLUSTER_BLOG_REPOSITORY],
          useFactory: (
            scope: ClusterScopeService,
            placements: IClusterBlogRepository,
          ): ClusterBlogPlacementScopeService => new ClusterBlogPlacementScopeService(scope, placements),
        },
        { provide: CLUSTER_CREATION_VALUES, useClass: ClusterCreationValuesAdapter },
        { provide: CLUSTER_BLOG_CREATION_VALUES, useClass: ClusterBlogCreationValuesAdapter },
        {
          provide: CREATE_CLUSTER,
          inject: [CLUSTER_REPOSITORY, SITE_LOOKUP_PORT, CLUSTER_CREATION_VALUES],
          useFactory: (
            clusters: IClusterRepository,
            sites: ISiteLookupPort,
            values: IClusterCreationValues,
          ): CreateClusterUseCase => new CreateClusterUseCase(clusters, sites, values),
        },
        {
          provide: UPDATE_CLUSTER,
          inject: [CLUSTER_REPOSITORY],
          useFactory: (clusters: IClusterRepository): UpdateClusterUseCase => new UpdateClusterUseCase(clusters),
        },
        {
          provide: GET_CLUSTER,
          inject: [CLUSTER_REPOSITORY],
          useFactory: (clusters: IClusterRepository): GetClusterUseCase => new GetClusterUseCase(clusters),
        },
        {
          provide: LIST_CLUSTERS,
          inject: [CLUSTER_REPOSITORY],
          useFactory: (clusters: IClusterRepository): ListClustersUseCase => new ListClustersUseCase(clusters),
        },
        {
          provide: ARCHIVE_CLUSTER,
          inject: [CLUSTER_REPOSITORY, ClusterScopeService],
          useFactory: (clusters: IClusterRepository, scope: ClusterScopeService): ArchiveClusterUseCase =>
            new ArchiveClusterUseCase(clusters, scope),
        },
        {
          provide: ADD_BLOG_TO_CLUSTER,
          inject: [CLUSTER_BLOG_REPOSITORY, BLOG_LOOKUP_PORT, ClusterScopeService, CLUSTER_BLOG_CREATION_VALUES],
          useFactory: (
            placements: IClusterBlogRepository,
            blogs: IBlogLookupPort,
            scope: ClusterScopeService,
            values: IClusterBlogCreationValues,
          ): AddBlogToClusterUseCase => new AddBlogToClusterUseCase(placements, blogs, scope, values),
        },
        {
          provide: UPDATE_CLUSTER_BLOG_PLACEMENT,
          inject: [CLUSTER_BLOG_REPOSITORY, ClusterBlogPlacementScopeService],
          useFactory: (
            placements: IClusterBlogRepository,
            scope: ClusterBlogPlacementScopeService,
          ): UpdateClusterBlogPlacementUseCase => new UpdateClusterBlogPlacementUseCase(placements, scope),
        },
        {
          provide: REMOVE_BLOG_FROM_CLUSTER,
          inject: [CLUSTER_BLOG_REPOSITORY, ClusterBlogPlacementScopeService],
          useFactory: (
            placements: IClusterBlogRepository,
            scope: ClusterBlogPlacementScopeService,
          ): RemoveBlogFromClusterUseCase => new RemoveBlogFromClusterUseCase(placements, scope),
        },
        {
          provide: MOVE_CLUSTER,
          inject: [CLUSTER_REPOSITORY, ClusterScopeService],
          useFactory: (clusters: IClusterRepository, scope: ClusterScopeService): MoveClusterUseCase =>
            new MoveClusterUseCase(clusters, scope),
        },
        {
          provide: REORDER_CLUSTER_BLOGS,
          inject: [CLUSTER_BLOG_REPOSITORY, ClusterScopeService],
          useFactory: (placements: IClusterBlogRepository, scope: ClusterScopeService): ReorderClusterBlogsUseCase =>
            new ReorderClusterBlogsUseCase(placements, scope),
        },
      ],
      exports: [
        CREATE_CLUSTER, UPDATE_CLUSTER, GET_CLUSTER, LIST_CLUSTERS, ARCHIVE_CLUSTER,
        ADD_BLOG_TO_CLUSTER, UPDATE_CLUSTER_BLOG_PLACEMENT, REMOVE_BLOG_FROM_CLUSTER,
        MOVE_CLUSTER, REORDER_CLUSTER_BLOGS,
      ],
    };
  }
}
