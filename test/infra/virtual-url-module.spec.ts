import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { UrlKind } from '../../src/domain/routing/url-kind.enum.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PUBLICATION_ACCESS, PUBLISH_ROUTING_RELEASE } from '../../src/infra/publication/publication.tokens.js';
import { MATERIALIZE_VIRTUAL_URL, VIRTUAL_URL_STORE } from '../../src/infra/routing/routing.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IMaterializeVirtualUrl } from '../../src/ports/inbound/routing/materialize-virtual-url.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';

it('resolves virtual folder materialization through AppModule and outbound overrides', async () => {
  const access = {
    assertEditor: vi.fn(async () => {
      throw new Error('Denied');
    }),
  };
  const store = { read: vi.fn() };
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_virtual_url',
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
    .overrideProvider(VIRTUAL_URL_STORE).useValue(store)
    .overrideProvider(PUBLICATION_ACCESS).useValue(access)
    .overrideProvider(PUBLISH_ROUTING_RELEASE).useValue({ execute: vi.fn() }).compile();

  try {
    await expect(module.get<IMaterializeVirtualUrl>(MATERIALIZE_VIRTUAL_URL).execute({
      siteId: 'site-1', actorId: 'operator', path: '/example/', kind: UrlKind.PAGE, pageId: 'page-1',
    })).rejects.toThrow('Denied');
    expect(store.read).not.toHaveBeenCalled();
  } finally {
    await module.close();
  }
});
