import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';

import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import {
  AdminDeploymentController,
  type IDeploymentConfigurationFactory,
} from '../../adapters/inbound/rest/deployment/admin-deployment.controller.js';
import {
  ConfigureDeploymentTargetUseCase,
} from '../../app/use-cases/deployment/configure-deployment-target.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  ICheckDeploymentTarget,
  IGetDeploymentStatus,
  IRetryDeployment,
} from '../../ports/inbound/deployment/deployment.port.js';
import type { IDeploymentAccessPort } from '../../ports/outbound/deployment/deployment-access.port.js';
import type { IDeploymentProviderCataloguePort } from '../../ports/outbound/deployment/deployment-provider.port.js';
import type { IDeploymentPublicationPort } from '../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../ports/outbound/deployment/deployment-store.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import {
  CHECK_DEPLOYMENT_TARGET,
  CONFIGURE_DEPLOYMENT_TARGET,
  DEPLOYMENT_ACCESS,
  DEPLOYMENT_PROVIDERS,
  DEPLOYMENT_PUBLICATIONS,
  DEPLOYMENT_STORE,
  GET_DEPLOYMENT_STATUS,
  RETRY_DEPLOYMENT,
} from './deployment.tokens.js';
import { deploymentManagementProviders } from './deployment-management.providers.js';

export function deploymentHttpProviders(settings: IPublicHttpSettings): Provider[] {
  const auth = settings.adminAuth;

  if (!auth) {
    return [];
  }

  return [
    ...deploymentManagementProviders(settings),
    {
      provide: CONFIGURE_DEPLOYMENT_TARGET,
      inject: [DEPLOYMENT_STORE, DEPLOYMENT_ACCESS, DEPLOYMENT_PUBLICATIONS, DEPLOYMENT_PROVIDERS,
        ADMIN_CONTENT_OPERATIONS],
      useFactory: (store: IDeploymentStorePort, access: IDeploymentAccessPort, publications: IDeploymentPublicationPort,
        catalogue: IDeploymentProviderCataloguePort,
        content: IAdminContentOperationFactory): IDeploymentConfigurationFactory => ({
        forSession: (token) => new ConfigureDeploymentTargetUseCase(store, access, publications,
          content.forSession(token).getSite, catalogue, { id: randomUUID, now: () => new Date() }),
      }),
    },
    {
      provide: AdminDeploymentController,
      inject: [GET_CURRENT_ADMIN_USER, GET_DEPLOYMENT_STATUS, CONFIGURE_DEPLOYMENT_TARGET, RETRY_DEPLOYMENT,
        CHECK_DEPLOYMENT_TARGET],
      useFactory: (current: IGetCurrentAdminUser, status: IGetDeploymentStatus,
        configure: IDeploymentConfigurationFactory,
        retry: IRetryDeployment, check: ICheckDeploymentTarget) => new AdminDeploymentController(auth, current,
        status, configure, retry, check),
    },
  ];
}
