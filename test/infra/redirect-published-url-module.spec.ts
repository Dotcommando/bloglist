import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PUBLICATION_ACCESS, PUBLISH_ROUTING_RELEASE } from '../../src/infra/publication/publication.tokens.js';
import { REDIRECT_PUBLISHED_URL, REDIRECT_URL } from '../../src/infra/routing/routing.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IRedirectPublishedUrl } from '../../src/ports/inbound/routing/redirect-published-url.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { urlFixture } from '../support/routing.js';

it('resolves immediate redirect publication through AppModule using outbound overrides', async () => {
  const publish = { execute: vi.fn(async () => null) };
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_redirect_publication',
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
    .overrideProvider(REDIRECT_URL).useValue({ execute: async () => urlFixture() })
    .overrideProvider(PUBLISH_ROUTING_RELEASE).useValue(publish)
    .overrideProvider(PUBLICATION_ACCESS).useValue({ assertEditor: async () => undefined }).compile();

  try {
    expect(await module.get<IRedirectPublishedUrl>(REDIRECT_PUBLISHED_URL).execute({
      siteId: 'site-1',
      actorId: 'operator',
      urlId: 'url-old',
      expectedVersion: 'v1',
      targetUrlId: 'home',
      redirectStatus: 301,
    })).toMatchObject({ publication: null, publicationFailed: false });
    expect(publish.execute).toHaveBeenCalledWith({ siteId: 'site-1', actorId: 'operator' });
  } finally {
    await module.close();
  }
});
