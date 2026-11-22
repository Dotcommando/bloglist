import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { NestFactory } from '@nestjs/core';

import type { IProcessDeploymentTargets } from '../../ports/inbound/deployment/deployment.port.js';
import { AppModule } from '../app.module.js';
import { readLocalSettings } from '../local-application.settings.js';
import { PROCESS_DEPLOYMENT_TARGETS } from './deployment.tokens.js';

export async function runDeploymentExecutor(environment: NodeJS.ProcessEnv, once: boolean): Promise<void> {
  const module = AppModule.forDeploymentExecutor(readLocalSettings(environment), {
    accountId: environment.CLOUDFLARE_ACCOUNT_ID ?? '',
    apiToken: environment.CLOUDFLARE_API_TOKEN ?? '',
    proxySecret: environment.ZARYA_EDGE_PROXY_SECRET ?? '',
    outputRoot: path.resolve(environment.ZARYA_DEPLOYMENT_ROOT ?? '.cloudflare'),
  });
  const app = await NestFactory.createApplicationContext(module, { logger: false, abortOnError: false });
  const controller = new AbortController();
  const stop = (): void => controller.abort();

  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  try {
    do {
      const result = await app.get<IProcessDeploymentTargets>(PROCESS_DEPLOYMENT_TARGETS).execute();

      if (result.processed) {
        console.info('Processed deployment targets: ' + result.processed);
      }
      if (once) {
        break;
      }
      await setTimeout(5000, undefined, { signal: controller.signal }).catch(() => {});
    } while (!controller.signal.aborted);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await app.close();
  }
}
