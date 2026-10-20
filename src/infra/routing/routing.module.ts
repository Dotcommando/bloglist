import type { DynamicModule, ModuleMetadata, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { UrlCreationValuesAdapter } from '../../adapters/outbound/system/routing/url-creation-values.adapter.js';
import { PageUrlPreparationService } from '../../app/services/routing/page-url-preparation.service.js';
import { AssignInitialPageUrlUseCase } from '../../app/use-cases/routing/assign-initial-page-url.use-case.js';
import { ChangePageUrlUseCase } from '../../app/use-cases/routing/change-page-url.use-case.js';
import { FindUrlByPathUseCase } from '../../app/use-cases/routing/find-url-by-path.use-case.js';
import { GetUrlHistoryUseCase } from '../../app/use-cases/routing/get-url-history.use-case.js';
import type { IPageLookupPort } from '../../ports/outbound/routing/page-lookup.port.js';
import type { IUrlRepository } from '../../ports/outbound/routing/url.repository.js';
import type { IUrlCreationValues } from '../../ports/outbound/routing/url-creation-values.port.js';
import {
  ASSIGN_INITIAL_PAGE_URL,
  CHANGE_PAGE_URL,
  FIND_URL_BY_PATH,
  GET_URL_HISTORY,
  PAGE_LOOKUP_PORT,
  URL_CREATION_VALUES,
  URL_REPOSITORY,
} from './routing.tokens.js';

export interface IRoutingModuleOptions {
  repository: Provider<IUrlRepository>;
  pageLookup: Provider<IPageLookupPort>;
  imports?: ModuleMetadata['imports'];
}

@Module({})
export class RoutingModule {
  static register(options: IRoutingModuleOptions): DynamicModule {
    if (typeof options.repository === 'function' || options.repository.provide !== URL_REPOSITORY) {
      throw new TypeError('The URL repository provider must use URL_REPOSITORY');
    }
    if (typeof options.pageLookup === 'function' || options.pageLookup.provide !== PAGE_LOOKUP_PORT) {
      throw new TypeError('The page lookup provider must use PAGE_LOOKUP_PORT');
    }

    return {
      module: RoutingModule,
      imports: options.imports ?? [],
      providers: [
        options.repository,
        options.pageLookup,
        { provide: URL_CREATION_VALUES, useClass: UrlCreationValuesAdapter },
        {
          provide: PageUrlPreparationService,
          inject: [URL_REPOSITORY, PAGE_LOOKUP_PORT, URL_CREATION_VALUES],
          useFactory: (
            urls: IUrlRepository,
            pages: IPageLookupPort,
            values: IUrlCreationValues,
          ): PageUrlPreparationService => new PageUrlPreparationService(urls, pages, values),
        },
        {
          provide: ASSIGN_INITIAL_PAGE_URL,
          inject: [URL_REPOSITORY, PageUrlPreparationService],
          useFactory: (urls: IUrlRepository, preparation: PageUrlPreparationService): AssignInitialPageUrlUseCase =>
            new AssignInitialPageUrlUseCase(urls, preparation),
        },
        {
          provide: CHANGE_PAGE_URL,
          inject: [URL_REPOSITORY, PageUrlPreparationService],
          useFactory: (urls: IUrlRepository, preparation: PageUrlPreparationService): ChangePageUrlUseCase =>
            new ChangePageUrlUseCase(urls, preparation),
        },
        {
          provide: FIND_URL_BY_PATH,
          inject: [URL_REPOSITORY],
          useFactory: (urls: IUrlRepository): FindUrlByPathUseCase => new FindUrlByPathUseCase(urls),
        },
        {
          provide: GET_URL_HISTORY,
          inject: [URL_REPOSITORY],
          useFactory: (urls: IUrlRepository): GetUrlHistoryUseCase => new GetUrlHistoryUseCase(urls),
        },
      ],
      exports: [ASSIGN_INITIAL_PAGE_URL, CHANGE_PAGE_URL, FIND_URL_BY_PATH, GET_URL_HISTORY],
    };
  }
}
