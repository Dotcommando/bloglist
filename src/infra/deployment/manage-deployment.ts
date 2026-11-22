import { readFile } from 'node:fs/promises';

import { NestFactory } from '@nestjs/core';

import type {
  ICheckDeploymentTarget, IConfigureDeploymentTarget, IGetDeploymentStatus, IRetryDeployment,
} from '../../ports/inbound/deployment/deployment.port.js';
import { AppModule } from '../app.module.js';
import { readLocalSettings } from '../local-application.settings.js';
import { cloudflareSettings } from './cloudflare.settings.js';
import {
  CHECK_DEPLOYMENT_TARGET,
  CONFIGURE_DEPLOYMENT_TARGET,
  GET_DEPLOYMENT_STATUS,
  RETRY_DEPLOYMENT,
} from './deployment.tokens.js';

export async function manageDeployment(action: string, environment: NodeJS.ProcessEnv): Promise<void> {
  if (!['configure', 'status', 'retry', 'check'].includes(action)) {
    throw new Error('Use deployment configure, status, retry or check');
  }

  const settings = readLocalSettings(environment);
  const target = cloudflareSettings(JSON.parse(await readFile('cloudflare.json', 'utf8')), settings);
  const app = await NestFactory.createApplicationContext(AppModule.forSiteDeployment(settings, target), {
    logger: false, abortOnError: false,
  });
  const identity = { siteId: target.siteId, actorId: settings.operator.operatorId };

  try {
    const operation = app.get<IGetDeploymentStatus>(GET_DEPLOYMENT_STATUS);
    const status = await operation.execute(identity);

    if (action === 'check') {
      const diagnostics = await app.get<ICheckDeploymentTarget>(CHECK_DEPLOYMENT_TARGET).execute(identity);

      console.info(JSON.stringify({ diagnostics }, null, 2));

      return;
    }
    if (action === 'configure') {
      await app.get<IConfigureDeploymentTarget>(CONFIGURE_DEPLOYMENT_TARGET).execute({
        ...identity,
        expectedVersion: status.target?.version ?? null,
        enabled: true,
        providerKey: 'cloudflare',
        destinationName: target.workerName,
        publicOrigin: target.publicOrigin,
        backendOrigin: target.backendOrigin,
      });
    } else if (action === 'retry') {
      if (!status.version) {
        throw new Error('Configure a deployment target first');
      }
      await app.get<IRetryDeployment>(RETRY_DEPLOYMENT).execute({ ...identity, expectedVersion: status.version });
    }
    console.info(JSON.stringify(await operation.execute(identity), null, 2));
  } finally {
    await app.close();
  }
}
