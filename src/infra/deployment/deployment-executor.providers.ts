import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { LocalSiteAccessAdapter } from '../../adapters/outbound/access/local/sites/local-site-access.adapter.js';
import {
  CloudflareDeliveryAdapter, type ICloudflareDeliverySettings,
} from '../../adapters/outbound/deployment/cloudflare/cloudflare-delivery.adapter.js';
import { FileDeliveryRestoreGuard } from '../../adapters/outbound/deployment/files/delivery-restore-guard.adapter.js';
import { publicationModels } from '../../adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  MongooseReleaseActivationAdapter,
} from '../../adapters/outbound/persistence/mongoose/publication/release-activation.adapter.js';
import { MongooseSiteRepository } from '../../adapters/outbound/persistence/mongoose/sites/site.repository.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import { FilePublicationStoreAdapter } from '../../adapters/outbound/publication/files/publication-store.adapter.js';
import { ProcessDeploymentTargetsUseCase } from '../../app/use-cases/deployment/process-deployment-targets.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import type { IDeploymentTarget } from '../../domain/deployment/deployment.js';
import type { IDeploymentProviderResolverPort } from '../../ports/outbound/deployment/deployment-provider.port.js';
import type { IDeploymentPublicationPort } from '../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../ports/outbound/deployment/deployment-store.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import type { ISiteAccessPort } from '../../ports/outbound/sites/site-access.port.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { PUBLICATION_STORE, RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { GET_SITE, SITE_ACCESS, SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { DEPLOYMENT_PROVIDER_RESOLVER } from './deployment.tokens.js';
import { DEPLOYMENT_PUBLICATIONS, DEPLOYMENT_STORE, PROCESS_DEPLOYMENT_TARGETS } from './deployment.tokens.js';

export interface IDeploymentExecutorSettings extends ICloudflareDeliverySettings {
  readonly proxySecret: string;
  readonly outputRoot: string;
}

export function deploymentExecutorProviders(settings: ILocalApplicationSettings,
  credentials: IDeploymentExecutorSettings,
  prepare: (target: IDeploymentTarget) => Promise<{ readonly releaseId: string; readonly directory: string }>,
  upload: (directory: string, receipt: string, target: IDeploymentTarget) => Promise<void>): Provider[] {
  return [
    {
      provide: SITE_REPOSITORY,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseSiteRepository(
        connection.model<ISiteRecord>('Site', siteSchema), () => new Date()),
    },
    { provide: SITE_ACCESS, useFactory: () => new LocalSiteAccessAdapter(settings.operator) },
    {
      provide: GET_SITE,
      inject: [SITE_REPOSITORY, SITE_ACCESS],
      useFactory: (sites: ISiteRepository, access: ISiteAccessPort) => new GetSiteUseCase(sites, access),
    },
    {
      provide: PUBLICATION_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new FilePublicationStoreAdapter(
        settings.rendering?.artifactsRoot ?? path.resolve('artifacts'), publicationModels(connection).releases,
        new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema))),
    },
    {
      provide: RELEASE_ACTIVATION,
      inject: [MONGO_CONNECTION, PUBLICATION_STORE],
      useFactory: (connection: Connection, store: IPublicationStorePort) =>
        new MongooseReleaseActivationAdapter(publicationModels(connection), store),
    },
    {
      provide: DEPLOYMENT_PROVIDER_RESOLVER,
      useFactory: (): IDeploymentProviderResolverPort => {
        const provider = new CloudflareDeliveryAdapter(credentials, prepare, upload);

        return { resolve: (key) => key === provider.key ? provider : null };
      },
    },
    {
      provide: PROCESS_DEPLOYMENT_TARGETS,
      inject: [DEPLOYMENT_STORE, DEPLOYMENT_PUBLICATIONS, DEPLOYMENT_PROVIDER_RESOLVER],
      useFactory: (store: IDeploymentStorePort, publications: IDeploymentPublicationPort,
        providers: IDeploymentProviderResolverPort) =>
        new ProcessDeploymentTargetsUseCase(store, publications, providers,
          { id: randomUUID, now: () => new Date() },
          new FileDeliveryRestoreGuard(settings.dumpsRoot ?? path.resolve('dumps'))),
    },
  ];
}
