import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ArchiveSiteUseCase } from '../src/app/use-cases/sites/archive-site.use-case.js';
import { CreateSiteUseCase } from '../src/app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../src/app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../src/app/use-cases/sites/list-sites.use-case.js';
import { UpdateSiteUseCase } from '../src/app/use-cases/sites/update-site.use-case.js';
import { Site } from '../src/domain/sites/site.js';
import { SiteStatus } from '../src/domain/sites/site-status.enum.js';
import { AppModule } from '../src/infra/app.module.js';
import { SitesModule } from '../src/infra/sites/sites.module.js';
import {
  ARCHIVE_SITE,
  CREATE_SITE,
  GET_SITE,
  LIST_SITES,
  SITE_CREATION_VALUES,
  SITE_REPOSITORY,
  UPDATE_SITE,
} from '../src/infra/sites/sites.tokens.js';
import type { IArchiveSite } from '../src/ports/inbound/sites/archive-site.port.js';
import type { ICreateSite } from '../src/ports/inbound/sites/create-site.port.js';
import type { IGetSite } from '../src/ports/inbound/sites/get-site.port.js';
import type { IListSites } from '../src/ports/inbound/sites/list-sites.port.js';
import type { IUpdateSite } from '../src/ports/inbound/sites/update-site.port.js';
import type { ISiteRepository } from '../src/ports/outbound/sites/site.repository.js';
import type { ISiteCreationValues } from '../src/ports/outbound/sites/site-creation-values.port.js';
import { instant, siteState } from './domain.fixtures.js';
import { siteRepository } from './sites.fixtures.js';

describe('Sites module composition', () => {
  it('registers and exports all five operations through AppModule with the supplied repository', async () => {
    const sites = siteRepository();
    const site = new Site(siteState());
    const module = await Test.createTestingModule({
      imports: [AppModule.registerSites({ repository: { provide: SITE_REPOSITORY, useValue: sites } })],
      providers: [{ provide: 'consumer', inject: [LIST_SITES], useFactory: (list: IListSites): IListSites => list }],
    })
      .overrideProvider(SITE_CREATION_VALUES)
      .useValue({ nextSiteId: (): string => 'site-1', currentInstant: instant })
      .compile();

    try {
      const create = module.get<ICreateSite>(CREATE_SITE);
      const update = module.get<IUpdateSite>(UPDATE_SITE);
      const archive = module.get<IArchiveSite>(ARCHIVE_SITE);
      const get = module.get<IGetSite>(GET_SITE);
      const list = module.get<IListSites>(LIST_SITES);

      expect(create).toBeInstanceOf(CreateSiteUseCase);
      expect(update).toBeInstanceOf(UpdateSiteUseCase);
      expect(archive).toBeInstanceOf(ArchiveSiteUseCase);
      expect(get).toBeInstanceOf(GetSiteUseCase);
      expect(list).toBeInstanceOf(ListSitesUseCase);
      expect(module.get('consumer')).toBe(list);
      const created = await create.execute({
        mark: 'Wood',
        name: 'Wood',
        primaryDomain: 'example.com',
        languages: ['en', 'de'],
        defaultLanguage: 'en',
      });

      expect(created.toState()).toEqual(site.toState());
      vi.mocked(sites.findById).mockResolvedValue(site);
      vi.mocked(sites.findAll).mockResolvedValue([site]);
      await expect(get.execute({ siteId: 'site-1' })).resolves.toBe(site);
      await expect(list.execute()).resolves.toEqual([site]);
      await expect(update.execute({ siteId: 'site-1', name: 'Updated' })).resolves.toHaveProperty('name', 'Updated');
      await expect(archive.execute({ siteId: 'site-1' })).resolves.toHaveProperty('status', SiteStatus.ARCHIVED);
    } finally {
      await module.close();
    }
  });

  it('supports repository factories and dependencies exported by an imported module', async () => {
    const sites = siteRepository();

    @Module({ providers: [{ provide: 'storage', useValue: sites }], exports: ['storage'] })
    class StorageModule {}

    const module = await Test.createTestingModule({
      imports: [AppModule.registerSites({
        imports: [StorageModule],
        repository: {
          provide: SITE_REPOSITORY,
          inject: ['storage'],
          useFactory: (storage: ISiteRepository): ISiteRepository => storage,
        },
      })],
    }).compile();

    try {
      expect(module.get(SITE_REPOSITORY)).toBe(sites);
      await expect(module.get<IListSites>(LIST_SITES).execute()).resolves.toEqual([]);
    } finally {
      await module.close();
    }
  });

  it('binds system-generated opaque identities and UTC instants', async () => {
    const module = await Test.createTestingModule({
      imports: [SitesModule.register({ repository: { provide: SITE_REPOSITORY, useValue: siteRepository() } })],
    }).compile();

    try {
      const values = module.get<ISiteCreationValues>(SITE_CREATION_VALUES);
      const id = values.nextSiteId();
      const before = Date.now();
      const at = values.currentInstant();

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(values.nextSiteId()).not.toBe(id);
      expect(at.getTime()).toBeGreaterThanOrEqual(before);
      expect(at.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      await module.close();
    }
  });

  it('rejects an incorrect repository token during registration', () => {
    expect(() => SitesModule.register({ repository: { provide: 'wrong', useValue: siteRepository() } }))
      .toThrow('The site repository provider must use SITE_REPOSITORY');
  });
});
