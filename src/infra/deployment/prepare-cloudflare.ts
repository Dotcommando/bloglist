import 'reflect-metadata';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';

import {
  readDeploymentOwner, withDeploymentLock,
} from '../../adapters/outbound/deployment/cloudflare/deployment-files.js';
import { runWrangler } from '../../adapters/outbound/deployment/cloudflare/wrangler.adapter.js';
import type { IPrepareSiteDeployment } from '../../ports/inbound/publication/prepare-site-deployment.port.js';
import { AppModule } from '../app.module.js';
import { readLocalSettings } from '../local-application.settings.js';
import { cloudflareSettings } from './cloudflare.settings.js';
import { PREPARE_SITE_DEPLOYMENT } from './deployment.tokens.js';

export async function prepareCloudflare(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<void> {
  if (
    args.some((argument) => !['--deploy', '--dry-run'].includes(argument))
    || args.includes('--dry-run')
    && !args.includes('--deploy')
  ) {
    throw new Error('Use cdn:prepare, or deploy:cloudflare with optional --dry-run');
  }
  if (args.includes('--deploy') && !args.includes('--dry-run') && !environment.ZARYA_EDGE_PROXY_SECRET?.trim()) {
    throw new Error('Set the same ZARYA_EDGE_PROXY_SECRET in the deployment environment and backend .env');
  }

  const settings = readLocalSettings(environment);
  const target = cloudflareSettings(JSON.parse(await readFile('cloudflare.json', 'utf8')), settings);
  const application = await NestFactory.createApplicationContext(AppModule.forSiteDeployment(settings, target), {
    logger: false, abortOnError: false,
  }).catch(() => {
    throw new Error('Cannot open the CMS export context; verify .env, MongoDB availability and migrations');
  });
  let publication;

  try {
    publication = await application.get<IPrepareSiteDeployment>(PREPARE_SITE_DEPLOYMENT).execute({
      siteId: target.siteId, actorId: settings.operator.operatorId,
    });
  } finally {
    await application.close();
  }
  console.info('Prepared ' + publication.files + ' public files in ' + publication.directory);

  if (publication.originFiles?.length) {
    console.info(publication.originFiles.length
      + ' public files exceed Cloudflare\'s 25 MiB asset limit and will be served by the backend.');
  }
  if (!args.includes('--deploy')) {
    return;
  }
  await withDeploymentLock(target.outputRoot, async () => {
    const selected = await readDeploymentOwner(target.outputRoot, target.siteId);

    if (selected.releaseId !== publication.releaseId || selected.exportId !== publication.exportId) {
      throw new Error('Another preparation replaced the output; repeat the deployment command');
    }
    await runWrangler(path.join(target.outputRoot, 'wrangler.json'), args.includes('--dry-run'),
      undefined, environment.ZARYA_EDGE_PROXY_SECRET);
  });
  console.info(args.includes('--dry-run')
    ? 'Cloudflare dry-run complete; nothing was deployed.' : 'Cloudflare deployment complete.');
}
