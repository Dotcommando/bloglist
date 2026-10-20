import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AssignInitialPageUrlUseCase } from '../src/app/use-cases/routing/assign-initial-page-url.use-case.js';
import { ChangePageUrlUseCase } from '../src/app/use-cases/routing/change-page-url.use-case.js';
import { FindUrlByPathUseCase } from '../src/app/use-cases/routing/find-url-by-path.use-case.js';
import { GetUrlHistoryUseCase } from '../src/app/use-cases/routing/get-url-history.use-case.js';
import { Url } from '../src/domain/routing/url.js';
import { UrlRedirectStatus } from '../src/domain/routing/url-redirect-status.enum.js';
import { AppModule } from '../src/infra/app.module.js';
import { RoutingModule } from '../src/infra/routing/routing.module.js';
import {
  ASSIGN_INITIAL_PAGE_URL,
  CHANGE_PAGE_URL,
  FIND_URL_BY_PATH,
  GET_URL_HISTORY,
  PAGE_LOOKUP_PORT,
  URL_CREATION_VALUES,
  URL_REPOSITORY,
} from '../src/infra/routing/routing.tokens.js';
import { LIST_SITES, SITE_REPOSITORY } from '../src/infra/sites/sites.tokens.js';
import type { IAssignInitialPageUrl } from '../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../src/ports/inbound/routing/change-page-url.port.js';
import type { IFindUrlByPath } from '../src/ports/inbound/routing/find-url-by-path.port.js';
import type { IGetUrlHistory } from '../src/ports/inbound/routing/get-url-history.port.js';
import type { IListSites } from '../src/ports/inbound/sites/list-sites.port.js';
import type { IUrlRepository } from '../src/ports/outbound/routing/url.repository.js';
import { instant, urlState } from './domain.fixtures.js';
import { pageLookup, urlRepository } from './routing.fixtures.js';
import { siteRepository } from './sites.fixtures.js';

describe('Routing module composition', () => {
  it('exports all four operations through AppModule using the supplied ports', async () => {
    const urls = urlRepository();
    const pages = pageLookup();
    const module = await Test.createTestingModule({
      imports: [AppModule.registerRouting({
        repository: { provide: URL_REPOSITORY, useValue: urls },
        pageLookup: { provide: PAGE_LOOKUP_PORT, useValue: pages },
      })],
      providers: [{
        provide: 'consumer',
        inject: [ASSIGN_INITIAL_PAGE_URL, CHANGE_PAGE_URL, FIND_URL_BY_PATH, GET_URL_HISTORY],
        useFactory: (
          assign: IAssignInitialPageUrl,
          change: IChangePageUrl,
          find: IFindUrlByPath,
          history: IGetUrlHistory,
        ): [IAssignInitialPageUrl, IChangePageUrl, IFindUrlByPath, IGetUrlHistory] => [assign, change, find, history],
      }],
    })
      .overrideProvider(URL_CREATION_VALUES)
      .useValue({ nextUrlId: (): string => 'url-new', currentInstant: instant })
      .compile();

    try {
      const assign = module.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL);
      const change = module.get<IChangePageUrl>(CHANGE_PAGE_URL);
      const find = module.get<IFindUrlByPath>(FIND_URL_BY_PATH);
      const history = module.get<IGetUrlHistory>(GET_URL_HISTORY);
      const input = {
        siteId: 'site-1',
        pageId: 'page-1',
        mark: 'NewWood',
        parentUrlId: null,
        segment: 'new-wood',
        path: '/new-wood/',
      };

      expect(assign).toBeInstanceOf(AssignInitialPageUrlUseCase);
      expect(change).toBeInstanceOf(ChangePageUrlUseCase);
      expect(find).toBeInstanceOf(FindUrlByPathUseCase);
      expect(history).toBeInstanceOf(GetUrlHistoryUseCase);
      expect(module.get('consumer')).toEqual([assign, change, find, history]);
      const created = await assign.execute(input);

      expect(created.toState()).toEqual(urlState({
        urlId: 'url-new', mark: 'NewWood', segment: 'new-wood', path: '/new-wood/',
      }));
      const previous = new Url(urlState());

      vi.mocked(urls.findCurrentByPage).mockResolvedValue(previous);
      const changed = await change.execute({ ...input, redirectStatus: UrlRedirectStatus.HTTP_308 });

      expect(changed.toState()).toEqual(created.toState());
      expect(urls.changePageUrl).toHaveBeenCalledTimes(1);
      vi.mocked(urls.findByPath).mockResolvedValue(previous);
      vi.mocked(urls.findById).mockResolvedValue(previous);
      await expect(find.execute({ siteId: 'site-1', path: '/wood/' })).resolves.toBe(previous);
      await expect(history.execute({ siteId: 'site-1', urlId: 'url-1' })).resolves.toEqual([]);
    } finally {
      await module.close();
    }
  });

  it('supports a repository factory and page lookup alias from an imported module', async () => {
    const urls = urlRepository();
    const pages = pageLookup();

    @Module({
      providers: [{ provide: 'urls', useValue: urls }, { provide: 'pages', useValue: pages }],
      exports: ['urls', 'pages'],
    })
    class StorageModule {}

    const module = await Test.createTestingModule({
      imports: [RoutingModule.register({
        imports: [StorageModule],
        repository: {
          provide: URL_REPOSITORY,
          inject: ['urls'],
          useFactory: (storage: IUrlRepository): IUrlRepository => storage,
        },
        pageLookup: { provide: PAGE_LOOKUP_PORT, useExisting: 'pages' },
      })],
    }).compile();

    try {
      expect(module.get(URL_REPOSITORY)).toBe(urls);
      expect(module.get(PAGE_LOOKUP_PORT)).toBe(pages);
      await expect(module.get<IFindUrlByPath>(FIND_URL_BY_PATH).execute({ siteId: 'site-1', path: '/wood/' }))
        .resolves.toBeNull();
    } finally {
      await module.close();
    }
  });

  it('composes sites and routing together and re-exports both sets of ports', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule.register({
        sites: { repository: { provide: SITE_REPOSITORY, useValue: siteRepository() } },
        routing: {
          repository: { provide: URL_REPOSITORY, useValue: urlRepository() },
          pageLookup: { provide: PAGE_LOOKUP_PORT, useValue: pageLookup() },
        },
      })],
      providers: [{
        provide: 'consumer',
        inject: [LIST_SITES, FIND_URL_BY_PATH],
        useFactory: (sites: IListSites, find: IFindUrlByPath): [IListSites, IFindUrlByPath] => [sites, find],
      }],
    }).compile();

    try {
      expect(module.get('consumer')).toEqual([module.get(LIST_SITES), module.get(FIND_URL_BY_PATH)]);
      await expect(module.get<IListSites>(LIST_SITES).execute()).resolves.toEqual([]);
    } finally {
      await module.close();
    }
  });

  it('rejects an incorrect URL repository token at registration', () => {
    expect(() => RoutingModule.register({
      repository: { provide: 'wrong', useValue: urlRepository() },
      pageLookup: { provide: PAGE_LOOKUP_PORT, useValue: pageLookup() },
    })).toThrow('The URL repository provider must use URL_REPOSITORY');
  });

  it('rejects an incorrect page lookup token at registration', () => {
    expect(() => RoutingModule.register({
      repository: { provide: URL_REPOSITORY, useValue: urlRepository() },
      pageLookup: { provide: 'wrong', useValue: pageLookup() },
    })).toThrow('The page lookup provider must use PAGE_LOOKUP_PORT');
  });
});
