import type { DynamicModule, ModuleMetadata, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { SiteCreationValuesAdapter } from '../../adapters/outbound/system/sites/site-creation-values.adapter.js';
import { ArchiveSiteUseCase } from '../../app/use-cases/sites/archive-site.use-case.js';
import { CreateSiteUseCase } from '../../app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../../app/use-cases/sites/list-sites.use-case.js';
import { UpdateSiteUseCase } from '../../app/use-cases/sites/update-site.use-case.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import type { ISiteCreationValues } from '../../ports/outbound/sites/site-creation-values.port.js';
import {
  ARCHIVE_SITE,
  CREATE_SITE,
  GET_SITE,
  LIST_SITES,
  SITE_CREATION_VALUES,
  SITE_REPOSITORY,
  UPDATE_SITE,
} from './sites.tokens.js';

export interface ISitesModuleOptions {
  repository: Provider<ISiteRepository>;
  imports?: ModuleMetadata['imports'];
}

@Module({})
export class SitesModule {
  static register(options: ISitesModuleOptions): DynamicModule {
    if (typeof options.repository === 'function' || options.repository.provide !== SITE_REPOSITORY) {
      throw new TypeError('The site repository provider must use SITE_REPOSITORY');
    }

    return {
      module: SitesModule,
      imports: options.imports ?? [],
      providers: [
        options.repository,
        { provide: SITE_CREATION_VALUES, useClass: SiteCreationValuesAdapter },
        {
          provide: CREATE_SITE,
          inject: [SITE_REPOSITORY, SITE_CREATION_VALUES],
          useFactory: (sites: ISiteRepository, values: ISiteCreationValues): CreateSiteUseCase =>
            new CreateSiteUseCase(sites, values),
        },
        {
          provide: UPDATE_SITE,
          inject: [SITE_REPOSITORY],
          useFactory: (sites: ISiteRepository): UpdateSiteUseCase => new UpdateSiteUseCase(sites),
        },
        {
          provide: ARCHIVE_SITE,
          inject: [SITE_REPOSITORY],
          useFactory: (sites: ISiteRepository): ArchiveSiteUseCase => new ArchiveSiteUseCase(sites),
        },
        {
          provide: GET_SITE,
          inject: [SITE_REPOSITORY],
          useFactory: (sites: ISiteRepository): GetSiteUseCase => new GetSiteUseCase(sites),
        },
        {
          provide: LIST_SITES,
          inject: [SITE_REPOSITORY],
          useFactory: (sites: ISiteRepository): ListSitesUseCase => new ListSitesUseCase(sites),
        },
      ],
      exports: [CREATE_SITE, UPDATE_SITE, ARCHIVE_SITE, GET_SITE, LIST_SITES],
    };
  }
}
