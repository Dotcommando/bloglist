import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AddBlogToClusterUseCase } from '../src/app/use-cases/clusters/add-blog-to-cluster.use-case.js';
import { ArchiveClusterUseCase } from '../src/app/use-cases/clusters/archive-cluster.use-case.js';
import { CreateClusterUseCase } from '../src/app/use-cases/clusters/create-cluster.use-case.js';
import { GetClusterUseCase } from '../src/app/use-cases/clusters/get-cluster.use-case.js';
import { ListClustersUseCase } from '../src/app/use-cases/clusters/list-clusters.use-case.js';
import { MoveClusterUseCase } from '../src/app/use-cases/clusters/move-cluster.use-case.js';
import { RemoveBlogFromClusterUseCase } from '../src/app/use-cases/clusters/remove-blog-from-cluster.use-case.js';
import { ReorderClusterBlogsUseCase } from '../src/app/use-cases/clusters/reorder-cluster-blogs.use-case.js';
import { UpdateClusterUseCase } from '../src/app/use-cases/clusters/update-cluster.use-case.js';
import {
  UpdateClusterBlogPlacementUseCase,
} from '../src/app/use-cases/clusters/update-cluster-blog-placement.use-case.js';
import { AppModule } from '../src/infra/app.module.js';
import { ClustersModule } from '../src/infra/clusters/clusters.module.js';
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
} from '../src/infra/clusters/clusters.tokens.js';
import {
  CLUSTER_LOOKUP_PORT,
  LIST_PAGES,
  PAGE_REPOSITORY,
  SITE_LOOKUP_PORT as PAGES_SITE_LOOKUP_PORT,
} from '../src/infra/pages/pages.tokens.js';
import { FIND_URL_BY_PATH, PAGE_LOOKUP_PORT, URL_REPOSITORY } from '../src/infra/routing/routing.tokens.js';
import { LIST_SITES, SITE_REPOSITORY } from '../src/infra/sites/sites.tokens.js';
import type { IAddBlogToCluster } from '../src/ports/inbound/clusters/add-blog-to-cluster.port.js';
import type { IArchiveCluster } from '../src/ports/inbound/clusters/archive-cluster.port.js';
import type { ICreateCluster } from '../src/ports/inbound/clusters/create-cluster.port.js';
import type { IGetCluster } from '../src/ports/inbound/clusters/get-cluster.port.js';
import type { IListClusters } from '../src/ports/inbound/clusters/list-clusters.port.js';
import type { IMoveCluster } from '../src/ports/inbound/clusters/move-cluster.port.js';
import type { IRemoveBlogFromCluster } from '../src/ports/inbound/clusters/remove-blog-from-cluster.port.js';
import type { IReorderClusterBlogs } from '../src/ports/inbound/clusters/reorder-cluster-blogs.port.js';
import type { IUpdateCluster } from '../src/ports/inbound/clusters/update-cluster.port.js';
import type {
  IUpdateClusterBlogPlacement,
} from '../src/ports/inbound/clusters/update-cluster-blog-placement.port.js';
import type { IListPages } from '../src/ports/inbound/pages/list-pages.port.js';
import type { IFindUrlByPath } from '../src/ports/inbound/routing/find-url-by-path.port.js';
import type { IListSites } from '../src/ports/inbound/sites/list-sites.port.js';
import type { IClusterRepository } from '../src/ports/outbound/clusters/cluster.repository.js';
import { blogLookup, clusterBlogRepository, clusterRepository, clustersSiteLookup } from './clusters.fixtures.js';
import { clusterState, instant, placementState } from './domain.fixtures.js';
import { clusterLookup, pageRepository, pagesSiteLookup } from './pages.fixtures.js';
import { pageLookup, urlRepository } from './routing.fixtures.js';
import { siteRepository } from './sites.fixtures.js';

describe('Clusters module composition', () => {
  it('exports and executes the implemented operations through AppModule', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();
    const module = await Test.createTestingModule({
      imports: [AppModule.registerClusters({
        repository: { provide: CLUSTER_REPOSITORY, useValue: clusters },
        siteLookup: { provide: SITE_LOOKUP_PORT, useValue: clustersSiteLookup() },
        placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useValue: placements },
        blogLookup: { provide: BLOG_LOOKUP_PORT, useValue: blogLookup() },
      })],
      providers: [{
        provide: 'consumer',
        inject: [CREATE_CLUSTER, UPDATE_CLUSTER, GET_CLUSTER, LIST_CLUSTERS],
        useFactory: (
          create: ICreateCluster,
          update: IUpdateCluster,
          get: IGetCluster,
          list: IListClusters,
        ): [ICreateCluster, IUpdateCluster, IGetCluster, IListClusters] => [create, update, get, list],
      }, {
        provide: 'membership-consumer',
        inject: [ARCHIVE_CLUSTER, ADD_BLOG_TO_CLUSTER, UPDATE_CLUSTER_BLOG_PLACEMENT, REMOVE_BLOG_FROM_CLUSTER],
        useFactory: (
          archive: IArchiveCluster,
          add: IAddBlogToCluster,
          update: IUpdateClusterBlogPlacement,
          remove: IRemoveBlogFromCluster,
        ): [IArchiveCluster, IAddBlogToCluster, IUpdateClusterBlogPlacement, IRemoveBlogFromCluster] =>
          [archive, add, update, remove],
      }, {
        provide: 'hierarchy-consumer',
        inject: [MOVE_CLUSTER, REORDER_CLUSTER_BLOGS],
        useFactory: (move: IMoveCluster, reorder: IReorderClusterBlogs): [IMoveCluster, IReorderClusterBlogs] =>
          [move, reorder],
      }],
    })
      .overrideProvider(CLUSTER_CREATION_VALUES)
      .useValue({ nextClusterId: (): string => 'cluster-1', currentInstant: instant })
      .overrideProvider(CLUSTER_BLOG_CREATION_VALUES)
      .useValue({ nextPlacementId: (): string => 'placement-1', currentInstant: instant })
      .compile();

    try {
      const create = module.get<ICreateCluster>(CREATE_CLUSTER);
      const update = module.get<IUpdateCluster>(UPDATE_CLUSTER);
      const get = module.get<IGetCluster>(GET_CLUSTER);
      const list = module.get<IListClusters>(LIST_CLUSTERS);
      const archive = module.get<IArchiveCluster>(ARCHIVE_CLUSTER);
      const add = module.get<IAddBlogToCluster>(ADD_BLOG_TO_CLUSTER);
      const updatePlacement = module.get<IUpdateClusterBlogPlacement>(UPDATE_CLUSTER_BLOG_PLACEMENT);
      const remove = module.get<IRemoveBlogFromCluster>(REMOVE_BLOG_FROM_CLUSTER);
      const move = module.get<IMoveCluster>(MOVE_CLUSTER);
      const reorder = module.get<IReorderClusterBlogs>(REORDER_CLUSTER_BLOGS);

      expect(create).toBeInstanceOf(CreateClusterUseCase);
      expect(update).toBeInstanceOf(UpdateClusterUseCase);
      expect(get).toBeInstanceOf(GetClusterUseCase);
      expect(list).toBeInstanceOf(ListClustersUseCase);
      expect(archive).toBeInstanceOf(ArchiveClusterUseCase);
      expect(add).toBeInstanceOf(AddBlogToClusterUseCase);
      expect(updatePlacement).toBeInstanceOf(UpdateClusterBlogPlacementUseCase);
      expect(remove).toBeInstanceOf(RemoveBlogFromClusterUseCase);
      expect(move).toBeInstanceOf(MoveClusterUseCase);
      expect(reorder).toBeInstanceOf(ReorderClusterBlogsUseCase);
      expect(module.get('consumer')).toEqual([create, update, get, list]);
      expect(module.get('membership-consumer')).toEqual([archive, add, updatePlacement, remove]);
      expect(module.get('hierarchy-consumer')).toEqual([move, reorder]);
      const created = await create.execute({ mark: 'WoodCluster', siteId: 'site-1', language: 'en', name: 'Wood' });

      expect(created.toState()).toEqual(clusterState());
      vi.mocked(clusters.findById).mockResolvedValue(created);
      await expect(update.execute({ siteId: 'site-1', clusterId: 'cluster-1', name: 'Updated' }))
        .resolves.toHaveProperty('name', 'Updated');
      await expect(get.execute({ siteId: 'site-1', clusterId: 'cluster-1' })).resolves.toBe(created);
      const all = [created];

      vi.mocked(clusters.findBySite).mockResolvedValue(all);
      await expect(list.execute({ siteId: 'site-1' })).resolves.toBe(all);
      await expect(archive.execute({ siteId: 'site-1', clusterId: 'cluster-1' }))
        .resolves.toHaveProperty('status', 'ARCHIVED');
      const placementTarget = { siteId: 'site-1', clusterId: 'cluster-1', blogId: 'blog-1' };
      const added = await add.execute({ ...placementTarget, position: 125.5 });

      expect(added.toState()).toEqual(placementState());
      vi.mocked(placements.findByClusterAndBlog).mockResolvedValue(added);
      await expect(updatePlacement.execute({ ...placementTarget, visible: false }))
        .resolves.toHaveProperty('visible', false);
      await expect(reorder.execute({
        siteId: 'site-1', clusterId: 'cluster-1', positions: [{ blogId: 'blog-1', position: 250.5 }],
      })).resolves.toBeUndefined();
      expect(placements.updatePositions).toHaveBeenCalledExactlyOnceWith('cluster-1', [
        { blogId: 'blog-1', position: 250.5 },
      ]);
      await expect(remove.execute(placementTarget)).resolves.toBeUndefined();
      expect(placements.remove).toHaveBeenCalledExactlyOnceWith('cluster-1', 'blog-1');

      vi.mocked(clusters.move).mockResolvedValue(created);
      await expect(move.execute({ siteId: 'site-1', clusterId: 'cluster-1', parentClusterId: null }))
        .resolves.toBe(created);
      expect(clusters.move).toHaveBeenCalledExactlyOnceWith({
        expectedCluster: created.toState(), parentClusterId: null,
      });
    } finally {
      await module.close();
    }
  });

  it('supports a repository factory and site lookup alias using imported dependencies', async () => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();
    const placements = clusterBlogRepository();
    const blogs = blogLookup();

    @Module({
      providers: [
        { provide: 'clusters', useValue: clusters }, { provide: 'sites', useValue: sites },
        { provide: 'placements', useValue: placements }, { provide: 'blogs', useValue: blogs },
      ],
      exports: ['clusters', 'sites', 'placements', 'blogs'],
    })
    class StorageModule {}

    const module = await Test.createTestingModule({
      imports: [ClustersModule.register({
        imports: [StorageModule],
        repository: {
          provide: CLUSTER_REPOSITORY,
          inject: ['clusters'],
          useFactory: (storage: IClusterRepository): IClusterRepository => storage,
        },
        siteLookup: { provide: SITE_LOOKUP_PORT, useExisting: 'sites' },
        placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useExisting: 'placements' },
        blogLookup: { provide: BLOG_LOOKUP_PORT, useExisting: 'blogs' },
      })],
    }).compile();

    try {
      expect(module.get(CLUSTER_REPOSITORY)).toBe(clusters);
      expect(module.get(SITE_LOOKUP_PORT)).toBe(sites);
      expect(module.get(CLUSTER_BLOG_REPOSITORY)).toBe(placements);
      expect(module.get(BLOG_LOOKUP_PORT)).toBe(blogs);
    } finally {
      await module.close();
    }
  });

  it('composes clusters with sites, pages and routing and re-exports their inbound providers', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule.register({
        clusters: {
          repository: { provide: CLUSTER_REPOSITORY, useValue: clusterRepository() },
          siteLookup: { provide: SITE_LOOKUP_PORT, useValue: clustersSiteLookup() },
          placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useValue: clusterBlogRepository() },
          blogLookup: { provide: BLOG_LOOKUP_PORT, useValue: blogLookup() },
        },
        sites: { repository: { provide: SITE_REPOSITORY, useValue: siteRepository() } },
        pages: {
          repository: { provide: PAGE_REPOSITORY, useValue: pageRepository() },
          siteLookup: { provide: PAGES_SITE_LOOKUP_PORT, useValue: pagesSiteLookup() },
          clusterLookup: { provide: CLUSTER_LOOKUP_PORT, useValue: clusterLookup() },
        },
        routing: {
          repository: { provide: URL_REPOSITORY, useValue: urlRepository() },
          pageLookup: { provide: PAGE_LOOKUP_PORT, useValue: pageLookup() },
        },
      })],
      providers: [{
        provide: 'consumer',
        inject: [LIST_CLUSTERS, LIST_SITES, LIST_PAGES, FIND_URL_BY_PATH],
        useFactory: (
          clusters: IListClusters,
          sites: IListSites,
          pages: IListPages,
          find: IFindUrlByPath,
        ): [IListClusters, IListSites, IListPages, IFindUrlByPath] => [clusters, sites, pages, find],
      }],
    }).compile();

    try {
      expect(module.get('consumer')).toEqual([
        module.get(LIST_CLUSTERS), module.get(LIST_SITES), module.get(LIST_PAGES), module.get(FIND_URL_BY_PATH),
      ]);
    } finally {
      await module.close();
    }
  });

  it('rejects a provider with an incorrect repository token', () => {
    expect(() => ClustersModule.register({
      repository: { provide: 'wrong', useValue: clusterRepository() },
      siteLookup: { provide: SITE_LOOKUP_PORT, useValue: clustersSiteLookup() },
      placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useValue: clusterBlogRepository() },
      blogLookup: { provide: BLOG_LOOKUP_PORT, useValue: blogLookup() },
    })).toThrow('The cluster repository provider must use CLUSTER_REPOSITORY');
  });

  it('rejects a provider with an incorrect site lookup token', () => {
    expect(() => ClustersModule.register({
      repository: { provide: CLUSTER_REPOSITORY, useValue: clusterRepository() },
      siteLookup: { provide: 'wrong', useValue: clustersSiteLookup() },
      placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useValue: clusterBlogRepository() },
      blogLookup: { provide: BLOG_LOOKUP_PORT, useValue: blogLookup() },
    })).toThrow('The site lookup provider must use SITE_LOOKUP_PORT');
  });

  it('rejects a provider with an incorrect placement repository token', () => {
    expect(() => ClustersModule.register({
      repository: { provide: CLUSTER_REPOSITORY, useValue: clusterRepository() },
      siteLookup: { provide: SITE_LOOKUP_PORT, useValue: clustersSiteLookup() },
      placementRepository: { provide: 'wrong', useValue: clusterBlogRepository() },
      blogLookup: { provide: BLOG_LOOKUP_PORT, useValue: blogLookup() },
    })).toThrow('The placement repository provider must use CLUSTER_BLOG_REPOSITORY');
  });

  it('rejects a provider with an incorrect blog lookup token', () => {
    expect(() => ClustersModule.register({
      repository: { provide: CLUSTER_REPOSITORY, useValue: clusterRepository() },
      siteLookup: { provide: SITE_LOOKUP_PORT, useValue: clustersSiteLookup() },
      placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useValue: clusterBlogRepository() },
      blogLookup: { provide: 'wrong', useValue: blogLookup() },
    })).toThrow('The blog lookup provider must use BLOG_LOOKUP_PORT');
  });
});
