import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { UrlSearchPurpose } from '../../src/domain/routing/url-search.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SEARCH_URLS, URL_REPOSITORY, URL_SEARCH } from '../../src/infra/routing/routing.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { ISearchUrls } from '../../src/ports/inbound/routing/search-urls.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakeUrlRepository, urlFixture } from '../support/routing.js';

it('resolves URL search through AppModule with an outbound search override', async () => {
  const urls = new FakeUrlRepository();

  urls.records.set('url-old', urlFixture());
  const search = { search: vi.fn(async () => []) };
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_search',
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
    .overrideProvider(URL_REPOSITORY).useValue(urls)
    .overrideProvider(URL_SEARCH).useValue(search).compile();

  try {
    expect(await module.get<ISearchUrls>(SEARCH_URLS).execute({
      siteId: 'site-1', currentUrlId: 'url-old', query: '', purpose: UrlSearchPurpose.Redirect, limit: 10, offset: 0,
    })).toEqual({ siteId: 'site-1', items: [] });
    expect(search.search).toHaveBeenCalledOnce();
  } finally {
    await module.close();
  }
});
