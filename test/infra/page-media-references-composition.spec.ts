import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { PAGE_ACCESS, PAGE_REPOSITORY, REWRITE_PAGE_MEDIA_REFERENCES } from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { GET_SITE } from '../../src/infra/sites/sites.tokens.js';
import type {
  IRewritePageMediaReferences,
} from '../../src/ports/inbound/pages/rewrite-page-media-references.port.js';
import { fakeHookChanges } from '../support/hooks.js';
import { FakePageRepository, pageFixture } from '../support/pages.js';
import { siteFixture } from '../support/sites.js';

it('resolves guarded page media-reference edits through AppModule with explicit fake ports', async () => {
  const repository = new FakePageRepository();
  const connection = createConnection();

  repository.records.set('page-1', pageFixture());
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'synthetic_media_references',
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(MONGO_CONNECTION).useValue(connection)
    .overrideProvider(HOOK_PERSISTENCE).useValue({ connection })
    .overrideProvider(HOOK_CONFIGURATION).useValue({})
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(PAGE_REPOSITORY).useValue(repository)
    .overrideProvider(PAGE_ACCESS).useValue({ assertCanUpdatePage: async () => {} })
    .overrideProvider(GET_SITE).useValue({ execute: async () => siteFixture() })
    .compile();

  try {
    await module.get<IRewritePageMediaReferences>(REWRITE_PAGE_MEDIA_REFERENCES).execute({
      siteId: 'site-1', pageId: 'page-1', paths: [],
    });
  } finally {
    await module.close();
  }
});
