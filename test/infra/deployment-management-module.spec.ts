import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AppModule } from '../../src/infra/app.module.js';
import {
  DEPLOYMENT_PUBLICATIONS, DEPLOYMENT_STORE, DEPLOYMENT_WORKER_SOURCE,
  GET_DEPLOYMENT_STATUS, PROCESS_DEPLOYMENT_TARGETS,
} from '../../src/infra/deployment/deployment.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SITE_REPOSITORY } from '../../src/infra/sites/sites.tokens.js';
import type { IGetDeploymentStatus } from '../../src/ports/inbound/deployment/deployment.port.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

describe('deployment administration composition', () => {
  it('resolves the durable executor operation with overridden outbound ports', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule.forDeploymentExecutor({
        mongoUri: 'mongodb://localhost:27017',
        database: 'synthetic_deployment',
        operator: { operatorId: 'operator', platformAdministrator: true },
      }, { accountId: 'a'.repeat(32), apiToken: 'secret', proxySecret: 'secret', outputRoot: '/synthetic/output' })],
    }).overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(DEPLOYMENT_STORE).useValue({ list: async () => [] })
      .compile();

    try {
      await expect(module.get<{ execute(): Promise<{ processed: number }> }>(PROCESS_DEPLOYMENT_TARGETS).execute())
        .resolves.toEqual({ processed: 0 });
    } finally {
      await module.close();
    }
  });

  it('resolves the status operation in AppModule with real authorization and overridden outbound ports', async () => {
    const sites = new FakeSiteRepository();

    sites.records.set('site-1', siteFixture());
    const module = await Test.createTestingModule({
      imports: [AppModule.forSiteDeployment({
        mongoUri: 'mongodb://localhost:27017',
        database: 'synthetic_deployment',
        operator: { operatorId: 'operator', platformAdministrator: true },
      }, {
        siteId: 'site-1',
        workerName: 'synthetic',
        outputRoot: '/synthetic/deploy',
        publicOrigin: 'https://example.test',
        backendOrigin: 'https://origin.test',
        mediaPath: '/assets',
      })],
    }).overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(DEPLOYMENT_WORKER_SOURCE).useValue('')
      .overrideProvider(SITE_REPOSITORY).useValue(sites)
      .overrideProvider(DEPLOYMENT_STORE).useValue({ get: async () => null })
      .overrideProvider(DEPLOYMENT_PUBLICATIONS).useValue({ current: async () => null })
      .compile();

    try {
      const operation = module.get<IGetDeploymentStatus>(GET_DEPLOYMENT_STATUS);

      await expect(operation.execute({ siteId: 'site-1', actorId: 'operator' }))
        .resolves.toMatchObject({ target: null, activeReleaseId: null });
      await expect(operation.execute({ siteId: 'site-1', actorId: 'foreign' }))
        .rejects.toMatchObject({ code: 'Forbidden' });
      await expect(operation.execute({ siteId: 'missing', actorId: 'operator' }))
        .rejects.toMatchObject({ code: 'NotFound' });
    } finally {
      await module.close();
    }
  });
});
