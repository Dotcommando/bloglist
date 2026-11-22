import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { AppModule } from '../../src/infra/app.module.js';
import {
  DEPLOYMENT_MEDIA_READS, DEPLOYMENT_WORKER_SOURCE, PREPARE_SITE_DEPLOYMENT, SITE_DEPLOYMENT_OUTPUT,
} from '../../src/infra/deployment/deployment.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PUBLICATION_STORE, RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import { SITE_REPOSITORY } from '../../src/infra/sites/sites.tokens.js';
import type { IPrepareSiteDeployment } from '../../src/ports/inbound/publication/prepare-site-deployment.port.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

describe('read-only local deployment composition', () => {
  it('resolves the operation through AppModule without starting HTTP, hook processors or add-ons', async () => {
    const sites = new FakeSiteRepository();
    const file = artifact('index.html', 'text/html', 'Static');
    const release = {
      siteId: 'site-1',
      releaseId: 'release-1',
      state: ReleaseState.Ready,
      manifest: { artifacts: [file], routes: [] },
    };
    const connection = createConnection();

    sites.records.set('site-1', siteFixture());
    const module = await Test.createTestingModule({
      imports: [AppModule.forSiteDeployment({
        mongoUri: 'mongodb://localhost:27017',
        database: 'synthetic_deployment',
        operator: { operatorId: 'operator', platformAdministrator: true },
      }, {
        siteId: 'site-1',
        workerName: 'example',
        outputRoot: '/synthetic/deploy',
        publicOrigin: 'https://example.test',
        backendOrigin: 'https://origin.test',
        mediaPath: '/assets',
      })],
    }).overrideProvider(MONGO_CONNECTION).useValue(connection)
      .overrideProvider(DEPLOYMENT_WORKER_SOURCE).useValue('')
      .overrideProvider(SITE_REPOSITORY).useValue(sites)
      .overrideProvider(PUBLICATION_STORE).useValue({ read: async () => release, readArtifacts: async () => [file] })
      .overrideProvider(RELEASE_ACTIVATION).useValue({
        getActive: async () => ({ siteId: 'site-1', releaseId: 'release-1' }),
      })
      .overrideProvider(DEPLOYMENT_MEDIA_READS).useValue(null)
      .overrideProvider(SITE_DEPLOYMENT_OUTPUT).useValue({
        write: async () => ({ directory: '/synthetic/deploy/public', files: 1 }),
      })
      .compile();

    try {
      const operation = module.get<IPrepareSiteDeployment>(PREPARE_SITE_DEPLOYMENT);

      await expect(operation.execute({ siteId: 'site-1', actorId: 'operator' })).resolves.toMatchObject({ files: 1 });
      await expect(operation.execute({ siteId: 'site-1', actorId: 'foreign' }))
        .rejects.toMatchObject({ code: 'Forbidden' });
    } finally {
      await module.close();
    }
  });
});
