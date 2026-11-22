import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { HookAccessAdapter } from '../../adapters/outbound/access/hooks/hook-access.adapter.js';
import { validateCloudflareTarget } from '../../adapters/outbound/deployment/cloudflare/cloudflare-target.validator.js';
import { DeploymentInspectionAdapter } from '../../adapters/outbound/deployment/deployment-inspection.adapter.js';
import {
  DeploymentProviderCatalogueAdapter,
} from '../../adapters/outbound/deployment/deployment-provider-catalogue.adapter.js';
import {
  MongooseDeploymentStore,
} from '../../adapters/outbound/persistence/mongoose/deployment/deployment-store.adapter.js';
import {
  MongooseHookGenerationAdapter,
} from '../../adapters/outbound/persistence/mongoose/hooks/hook-generation.adapter.js';
import {
  PublicationDeploymentSourceAdapter,
} from '../../adapters/outbound/publication/deployment/publication-deployment-source.adapter.js';
import { CheckDeploymentTargetUseCase } from '../../app/use-cases/deployment/check-deployment-target.use-case.js';
import {
  ConfigureDeploymentTargetUseCase,
} from '../../app/use-cases/deployment/configure-deployment-target.use-case.js';
import { GetDeploymentStatusUseCase } from '../../app/use-cases/deployment/get-deployment-status.use-case.js';
import { RetryDeploymentUseCase } from '../../app/use-cases/deployment/retry-deployment.use-case.js';
import type { IGetDeploymentStatus } from '../../ports/inbound/deployment/deployment.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IAdminUserReaderPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IDeploymentAccessPort } from '../../ports/outbound/deployment/deployment-access.port.js';
import type { IDeploymentInspectionPort } from '../../ports/outbound/deployment/deployment-inspection.port.js';
import type { IDeploymentProviderCataloguePort } from '../../ports/outbound/deployment/deployment-provider.port.js';
import type { IDeploymentPublicationPort } from '../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../ports/outbound/deployment/deployment-store.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { PUBLICATION_STORE } from '../publication/publication.tokens.js';
import { RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { CHECK_DEPLOYMENT_TARGET, DEPLOYMENT_INSPECTION } from './deployment.tokens.js';
import { RETRY_DEPLOYMENT } from './deployment.tokens.js';
import { CONFIGURE_DEPLOYMENT_TARGET, DEPLOYMENT_PROVIDERS } from './deployment.tokens.js';
import {
  DEPLOYMENT_ACCESS, DEPLOYMENT_PUBLICATIONS, DEPLOYMENT_STORE, GET_DEPLOYMENT_STATUS,
} from './deployment.tokens.js';

export function deploymentManagementProviders(settings: ILocalApplicationSettings | IPublicHttpSettings): Provider[] {
  return [
    {
      provide: DEPLOYMENT_INSPECTION,
      inject: [PUBLICATION_STORE],
      useFactory: (store: IPublicationStorePort) => new DeploymentInspectionAdapter(store),
    },
    {
      provide: CHECK_DEPLOYMENT_TARGET,
      inject: [DEPLOYMENT_STORE, DEPLOYMENT_ACCESS, DEPLOYMENT_PUBLICATIONS, DEPLOYMENT_PROVIDERS,
        DEPLOYMENT_INSPECTION],
      useFactory: (store: IDeploymentStorePort, access: IDeploymentAccessPort, publications: IDeploymentPublicationPort,
        catalogue: IDeploymentProviderCataloguePort, inspection: IDeploymentInspectionPort) =>
        new CheckDeploymentTargetUseCase(store, access, publications, catalogue, inspection),
    },
    {
      provide: RETRY_DEPLOYMENT,
      inject: [DEPLOYMENT_STORE, DEPLOYMENT_ACCESS, DEPLOYMENT_PUBLICATIONS, GET_DEPLOYMENT_STATUS],
      useFactory: (store: IDeploymentStorePort, access: IDeploymentAccessPort, publications: IDeploymentPublicationPort,
        status: IGetDeploymentStatus) => new RetryDeploymentUseCase(store, access, publications,
        { id: randomUUID, now: () => new Date() }, status),
    },
    {
      provide: DEPLOYMENT_PROVIDERS,
      useFactory: () => new DeploymentProviderCatalogueAdapter(new Map([['cloudflare', validateCloudflareTarget]])),
    },
    ...('operator' in settings ? [{
      provide: CONFIGURE_DEPLOYMENT_TARGET,
      inject: [DEPLOYMENT_STORE, DEPLOYMENT_ACCESS, DEPLOYMENT_PUBLICATIONS, GET_SITE, DEPLOYMENT_PROVIDERS],
      useFactory: (store: IDeploymentStorePort, access: IDeploymentAccessPort, publications: IDeploymentPublicationPort,
        sites: IGetSite, catalogue: IDeploymentProviderCataloguePort) => new ConfigureDeploymentTargetUseCase(
        store, access, publications, sites, catalogue, { id: randomUUID, now: () => new Date() }),
    }] : []),
    {
      provide: DEPLOYMENT_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseDeploymentStore(connection),
    },
    {
      provide: DEPLOYMENT_ACCESS,
      inject: [SITE_REPOSITORY, ...('operator' in settings ? [] : [ADMIN_USER_STORE])],
      useFactory: (sites: ISiteRepository, users?: IAdminUserReaderPort) => new HookAccessAdapter(users ?? null,
        'operator' in settings ? settings.operator.operatorId : null, async (siteId) => !!await sites.findById(siteId)),
    },
    {
      provide: DEPLOYMENT_PUBLICATIONS,
      inject: [MONGO_CONNECTION, RELEASE_ACTIVATION],
      useFactory: (connection: Connection, activation: IReleaseActivationPort) =>
        new PublicationDeploymentSourceAdapter(
          activation, new MongooseHookGenerationAdapter(connection)),
    },
    {
      provide: GET_DEPLOYMENT_STATUS,
      inject: [DEPLOYMENT_STORE, DEPLOYMENT_ACCESS, DEPLOYMENT_PUBLICATIONS],
      useFactory: (store: IDeploymentStorePort, access: IDeploymentAccessPort,
        publications: IDeploymentPublicationPort) =>
        new GetDeploymentStatusUseCase(store, access, publications),
    },
  ];
}
