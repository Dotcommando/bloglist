import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { Page } from '../../src/domain/pages/page.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { ARCHIVE_PAGE, PAGE_ARCHIVAL, PAGE_REPOSITORY } from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import {
  REBIND_URL_TO_PAGE, URL_BEHAVIOR_STORE, URL_BEHAVIOR_VALUES, URL_REPOSITORY,
} from '../../src/infra/routing/routing.tokens.js';
import { REDIRECT_URL } from '../../src/infra/routing/routing.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import { SITE_REPOSITORY, SITE_UPDATE_STORE, UPDATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { ARCHIVE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IArchivePage } from '../../src/ports/inbound/pages/archive-page.port.js';
import type { IRebindUrlToPage } from '../../src/ports/inbound/routing/rebind-url-to-page.port.js';
import type { IRedirectUrl } from '../../src/ports/inbound/routing/redirect-url.port.js';
import type { IArchiveSite } from '../../src/ports/inbound/sites/archive-site.port.js';
import type { IUpdateSite } from '../../src/ports/inbound/sites/update-site.port.js';
import type { IPageArchivalPort } from '../../src/ports/outbound/pages/page-archival.port.js';
import type { ISiteUpdateStorePort } from '../../src/ports/outbound/sites/site-update-store.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakePageRepository, pageFixture } from '../support/pages.js';
import { urlFixture } from '../support/routing.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';
import { behaviorFixture } from '../support/url-behavior.js';

it('resolves UpdateSite through AppModule with outbound overrides', async () => {
  const sites = new FakeSiteRepository();

  sites.records.set('site-1', siteFixture());
  const updates: ISiteUpdateStorePort = { saveUpdate: async (_previous, next) => sites.save(next) };
  const pages = new FakePageRepository();
  const routing = behaviorFixture();

  pages.records.set('page-1', pageFixture());
  const archival: IPageArchivalPort = {
    archive: async (previous) => {
      const page = new Page(previous);

      page.archive();

      return pages.save(page);
    },
  };
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_editing',
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
    .overrideProvider(SITE_REPOSITORY).useValue(sites)
    .overrideProvider(SITE_UPDATE_STORE).useValue(updates)
    .overrideProvider(PAGE_REPOSITORY).useValue(pages)
    .overrideProvider(URL_REPOSITORY).useValue(routing.urls)
    .overrideProvider(URL_BEHAVIOR_STORE).useValue(routing.store)
    .overrideProvider(URL_BEHAVIOR_VALUES).useValue(routing.values)
    .overrideProvider(PAGE_ARCHIVAL).useValue(archival).compile();

  try {
    expect((await module.get<IUpdateSite>(UPDATE_SITE).execute({ siteId: 'site-1', name: 'Changed' })).name)
      .toBe('Changed');
    expect((await module.get<IArchiveSite>(ARCHIVE_SITE).execute({ siteId: 'site-1' })).status).toBe('ARCHIVED');
    expect((await module.get<IArchivePage>(ARCHIVE_PAGE).execute({ siteId: 'site-1', pageId: 'page-1' })).status)
      .toBe('ARCHIVED');
    pages.records.set('page-2', pageFixture('page-2', 'site-1', 'Replacement'));
    expect((await module.get<IRebindUrlToPage>(REBIND_URL_TO_PAGE).execute({
      siteId: 'site-1',
      actorId: 'operator',
      urlId: 'url-old',
      expectedVersion: 'v1',
      replacementPageId: 'page-2',
    })).pageId).toBe('page-2');
    routing.urls.records.set('target', urlFixture({
      urlId: 'target',
      mark: 'Target',
      path: '/target',
      pageId: 'page-3',
    }));
    const current = await routing.store.findVersionedUrl('site-1', 'url-old');

    expect((await module.get<IRedirectUrl>(REDIRECT_URL).execute({
      siteId: 'site-1',
      actorId: 'operator',
      urlId: 'url-old',
      expectedVersion: current!.version,
      targetUrlId: 'target',
      redirectStatus: UrlRedirectStatus.HTTP_301,
    })).kind)
      .toBe('REDIRECT');
  } finally {
    await module.close();
  }
});
