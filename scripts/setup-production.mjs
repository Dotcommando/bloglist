import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

function productionOrigin(value) {
  const url = new URL(value);

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !url.hostname.includes('.')
    || isIP(url.hostname)
    || url.hostname.endsWith('.localhost')
  ) {
    throw new Error('Use distinct public HTTPS domain origins without credentials, ports, paths or queries.');
  }

  return url;
}

export async function initializeProduction({ directory, publicOrigin, backendOrigin }) {
  const publicUrl = productionOrigin(publicOrigin);
  const backendUrl = productionOrigin(backendOrigin);

  if (publicUrl.origin === backendUrl.origin) {
    throw new Error('Public and backend origins must differ to prevent a proxy loop.');
  }

  const rootPassword = randomBytes(32).toString('hex');
  const appPassword = randomBytes(32).toString('hex');
  const environment = [
    'COMPOSE_FILE=compose.production.yml',
    'ZARYA_PUBLIC_ORIGIN=' + publicUrl.origin,
    'ZARYA_BACKEND_ORIGIN=' + backendUrl.origin,
    'ZARYA_BACKEND_HOST=' + backendUrl.host,
    'ZARYA_UPSTREAM_HOST=' + backendUrl.host,
    'ZARYA_ADMIN_AUTH_ORIGIN=' + backendUrl.origin,
    'ZARYA_MONGO_DATABASE=zarya_production',
    'ZARYA_MONGO_URI=mongodb://zarya_app:' + appPassword
    + '@mongo:27017/zarya_production?replicaSet=zarya-rs&authSource=zarya_production',
    'ZARYA_LOCAL_OPERATOR_ID=' + randomUUID(),
    'MONGO_ROOT_PASSWORD=' + rootPassword,
    'MONGO_APP_PASSWORD=' + appPassword,
    'ZARYA_EDGE_PROXY_SECRET=' + randomBytes(32).toString('hex'),
    'CLOUDFLARE_ACCOUNT_ID=',
    'CLOUDFLARE_API_TOKEN=',
    '',
  ].join('\n');

  await writeFile(path.join(directory, '.env'), environment, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        'public-origin': { type: 'string' },
        'backend-origin': { type: 'string' },
      },
    });

    if (!values['public-origin'] || !values['backend-origin']) {
      throw new Error('Usage: node scripts/setup-production.mjs --public-origin https://www.example.com'
        + ' --backend-origin https://api.example.com');
    }
    await initializeProduction({
      directory: process.cwd(),
      publicOrigin: values['public-origin'],
      backendOrigin: values['backend-origin'],
    });
    console.info('Created private .env with new installation secrets. Existing files are never replaced.');
    console.info('Add Cloudflare account ID and API token to .env before starting the deployment executor.');
  } catch (error) {
    console.error(error?.code === 'EEXIST'
      ? 'An .env file already exists. Keep it; setup will not replace installation secrets.'
      : 'Setup failed: ' + (error instanceof Error ? error.message : 'invalid settings'));
    process.exitCode = 1;
  }
}
