import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ArchivePageUseCase } from '../src/app/use-cases/pages/archive-page.use-case.js';
import { AssignPageToClusterUseCase } from '../src/app/use-cases/pages/assign-page-to-cluster.use-case.js';
import { CreatePageUseCase } from '../src/app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../src/app/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../src/app/use-cases/pages/list-pages.use-case.js';
import { PublishPageUseCase } from '../src/app/use-cases/pages/publish-page.use-case.js';
import { UpdatePageUseCase } from '../src/app/use-cases/pages/update-page.use-case.js';
import { PageStatus } from '../src/domain/pages/page-status.enum.js';
import { AppModule } from '../src/infra/app.module.js';
import { PagesModule } from '../src/infra/pages/pages.module.js';
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
} from '../src/infra/pages/pages.tokens.js';
import { FIND_URL_BY_PATH, PAGE_LOOKUP_PORT, URL_REPOSITORY } from '../src/infra/routing/routing.tokens.js';
import { LIST_SITES, SITE_REPOSITORY } from '../src/infra/sites/sites.tokens.js';
import type { IArchivePage } from '../src/ports/inbound/pages/archive-page.port.js';
import type { IAssignPageToCluster } from '../src/ports/inbound/pages/assign-page-to-cluster.port.js';
import type { ICreatePage } from '../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../src/ports/inbound/pages/get-page.port.js';
import type { IListPages } from '../src/ports/inbound/pages/list-pages.port.js';
import type { IPublishPage } from '../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../src/ports/inbound/pages/update-page.port.js';
import type { IFindUrlByPath } from '../src/ports/inbound/routing/find-url-by-path.port.js';
import type { IListSites } from '../src/ports/inbound/sites/list-sites.port.js';
import type { IPageRepository } from '../src/ports/outbound/pages/page.repository.js';
import { instant, pageState } from './domain.fixtures.js';
import { clusterLookup, pageRepository, pagesSiteLookup } from './pages.fixtures.js';
import { pageLookup, urlRepository } from './routing.fixtures.js';
import { siteRepository } from './sites.fixtures.js';

describe('Pages module composition', () => {
  it('registers and exports all seven page operations through AppModule', async () => {
    const pages = pageRepository();
    const module = await Test.createTestingModule({
      imports: [AppModule.registerPages({
        repository: { provide: PAGE_REPOSITORY, useValue: pages },
        siteLookup: { provide: SITE_LOOKUP_PORT, useValue: pagesSiteLookup() },
        clusterLookup: { provide: CLUSTER_LOOKUP_PORT, useValue: clusterLookup() },
      })],
      providers: [{
        provide: 'consumer',
        inject: [CREATE_PAGE, UPDATE_PAGE, ASSIGN_PAGE_TO_CLUSTER, PUBLISH_PAGE],
        useFactory: (
          create: ICreatePage,
          update: IUpdatePage,
          assign: IAssignPageToCluster,
          publish: IPublishPage,
        ): [ICreatePage, IUpdatePage, IAssignPageToCluster, IPublishPage] => [create, update, assign, publish],
      }, {
        provide: 'remaining-consumer',
        inject: [ARCHIVE_PAGE, GET_PAGE, LIST_PAGES],
        useFactory: (
          archive: IArchivePage,
          get: IGetPage,
          list: IListPages,
        ): [IArchivePage, IGetPage, IListPages] => [archive, get, list],
      }],
    })
      .overrideProvider(PAGE_LIFECYCLE_VALUES)
      .useValue({ nextPageId: (): string => 'page-1', currentInstant: instant })
      .compile();

    try {
      const create = module.get<ICreatePage>(CREATE_PAGE);
      const update = module.get<IUpdatePage>(UPDATE_PAGE);
      const assign = module.get<IAssignPageToCluster>(ASSIGN_PAGE_TO_CLUSTER);
      const publish = module.get<IPublishPage>(PUBLISH_PAGE);
      const archive = module.get<IArchivePage>(ARCHIVE_PAGE);
      const get = module.get<IGetPage>(GET_PAGE);
      const list = module.get<IListPages>(LIST_PAGES);

      expect(create).toBeInstanceOf(CreatePageUseCase);
      expect(update).toBeInstanceOf(UpdatePageUseCase);
      expect(assign).toBeInstanceOf(AssignPageToClusterUseCase);
      expect(publish).toBeInstanceOf(PublishPageUseCase);
      expect(archive).toBeInstanceOf(ArchivePageUseCase);
      expect(get).toBeInstanceOf(GetPageUseCase);
      expect(list).toBeInstanceOf(ListPagesUseCase);
      expect(module.get('consumer')).toEqual([create, update, assign, publish]);
      expect(module.get('remaining-consumer')).toEqual([archive, get, list]);
      const created = await create.execute({ mark: 'WoodPage', siteId: 'site-1', language: 'en', title: 'Wood' });

      expect(created.toState()).toEqual(pageState());
      vi.mocked(pages.findById).mockResolvedValue(created);
      const target = { siteId: 'site-1', pageId: 'page-1' };

      await expect(update.execute({ ...target, title: 'Updated' })).resolves.toHaveProperty('title', 'Updated');
      await expect(assign.execute({ ...target, clusterId: 'cluster-1' }))
        .resolves.toHaveProperty('clusterId', 'cluster-1');
      await expect(publish.execute(target)).resolves.toHaveProperty('status', PageStatus.PUBLISHED);

      await expect(archive.execute(target)).resolves.toHaveProperty('status', PageStatus.ARCHIVED);
      await expect(get.execute(target)).resolves.toBe(created);
      const results = [created];

      vi.mocked(pages.findBySite).mockResolvedValue(results);
      await expect(list.execute({ siteId: 'site-1' })).resolves.toBe(results);
    } finally {
      await module.close();
    }
  });

  it('supports a repository factory and lookup aliases from an imported module', async () => {
    const pages = pageRepository();
    const sites = pagesSiteLookup();
    const clusters = clusterLookup();

    @Module({
      providers: [
        { provide: 'pages', useValue: pages },
        { provide: 'sites', useValue: sites },
        { provide: 'clusters', useValue: clusters },
      ],
      exports: ['pages', 'sites', 'clusters'],
    })
    class StorageModule {}

    const module = await Test.createTestingModule({
      imports: [PagesModule.register({
        imports: [StorageModule],
        repository: {
          provide: PAGE_REPOSITORY,
          inject: ['pages'],
          useFactory: (storage: IPageRepository): IPageRepository => storage,
        },
        siteLookup: { provide: SITE_LOOKUP_PORT, useExisting: 'sites' },
        clusterLookup: { provide: CLUSTER_LOOKUP_PORT, useExisting: 'clusters' },
      })],
    }).compile();

    try {
      expect(module.get(PAGE_REPOSITORY)).toBe(pages);
      expect(module.get(SITE_LOOKUP_PORT)).toBe(sites);
      expect(module.get(CLUSTER_LOOKUP_PORT)).toBe(clusters);
    } finally {
      await module.close();
    }
  });

  it('composes pages, routing and sites together and re-exports their inbound ports', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule.register({
        sites: { repository: { provide: SITE_REPOSITORY, useValue: siteRepository() } },
        routing: {
          repository: { provide: URL_REPOSITORY, useValue: urlRepository() },
          pageLookup: { provide: PAGE_LOOKUP_PORT, useValue: pageLookup() },
        },
        pages: {
          repository: { provide: PAGE_REPOSITORY, useValue: pageRepository() },
          siteLookup: { provide: SITE_LOOKUP_PORT, useValue: pagesSiteLookup() },
          clusterLookup: { provide: CLUSTER_LOOKUP_PORT, useValue: clusterLookup() },
        },
      })],
      providers: [{
        provide: 'consumer',
        inject: [LIST_SITES, FIND_URL_BY_PATH, CREATE_PAGE],
        useFactory: (
          sites: IListSites,
          find: IFindUrlByPath,
          create: ICreatePage,
        ): [IListSites, IFindUrlByPath, ICreatePage] => [sites, find, create],
      }],
    }).compile();

    try {
      expect(module.get('consumer')).toEqual([
        module.get(LIST_SITES), module.get(FIND_URL_BY_PATH), module.get(CREATE_PAGE),
      ]);
    } finally {
      await module.close();
    }
  });

  it.each([
    { field: 'repository', message: 'The page repository provider must use PAGE_REPOSITORY' },
    { field: 'siteLookup', message: 'The site lookup provider must use SITE_LOOKUP_PORT' },
    { field: 'clusterLookup', message: 'The cluster lookup provider must use CLUSTER_LOOKUP_PORT' },
  ])('rejects an incorrect $field token during registration', ({ field, message }) => {
    const options = {
      repository: { provide: PAGE_REPOSITORY, useValue: pageRepository() },
      siteLookup: { provide: SITE_LOOKUP_PORT, useValue: pagesSiteLookup() },
      clusterLookup: { provide: CLUSTER_LOOKUP_PORT, useValue: clusterLookup() },
    };

    Object.assign(options, { [field]: { provide: 'wrong', useValue: null } });
    expect(() => PagesModule.register(options)).toThrow(message);
  });
});
