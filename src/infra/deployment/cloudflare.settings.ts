import path from 'node:path';

import type {
  ICloudflareDeploymentSettings,
} from '../../adapters/outbound/deployment/cloudflare/cloudflare-deployment.adapter.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';

export function cloudflareSettings(value: unknown, local: ILocalApplicationSettings,
  projectRoot = process.cwd()): ICloudflareDeploymentSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cloudflare.json must contain a configuration object');
  }

  const fields = ['siteId', 'workerName', 'publicOrigin', 'backendOrigin'] as const;

  if (Object.keys(value).some((key) => !fields.some((field) => field === key))) {
    throw new Error('Unknown cloudflare.json field');
  }

  const field = (key: typeof fields[number]): string => {
    const item: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;

    if (typeof item !== 'string' || !item.trim()) {
      throw new Error('Missing Cloudflare configuration: ' + key);
    }

    return item;
  };
  const siteId = field('siteId');
  const workerName = field('workerName');
  const publicOrigin = field('publicOrigin');
  const backendOrigin = field('backendOrigin');

  for (const origin of [publicOrigin, backendOrigin]) {
    const url = new URL(origin);

    if (
      url.origin !== origin
      || url.username
      || url.password
      || url.protocol !== 'https:'
      && !(url.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) {
      throw new Error('Cloudflare origins require HTTPS, or localhost HTTP, without a path or credentials');
    }
  }

  if (
    publicOrigin === backendOrigin
    || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName)
    || !/^[A-Za-z0-9_-]{1,128}$/.test(siteId)
  ) {
    throw new Error('Invalid worker/site identity or a proxy loop between public and backend origins');
  }

  const outputRoot = path.resolve(projectRoot, 'deploy');
  const protectedRoots = [
    local.rendering?.sourcesRoot, local.rendering?.artifactsRoot, local.media?.root, local.dumpsRoot,
  ]
    .filter((root): root is string => root !== undefined).map((root) => path.resolve(root));

  if (
    protectedRoots.some((root) => root === outputRoot || root.startsWith(outputRoot + path.sep)
    || outputRoot.startsWith(root + path.sep))
  ) {
    throw new Error('Deployment output must not overlap sources, artifacts, media or dumps');
  }

  return Object.freeze({
    siteId,
    workerName,
    publicOrigin,
    backendOrigin,
    outputRoot,
    mediaPath: local.media?.publicBaseUrl ?? '/assets',
  });
}
