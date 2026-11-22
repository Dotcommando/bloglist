import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

interface IComposeServices {
  services: Record<string, {
    network_mode?: string;
    depends_on?: Record<string, unknown>;
    command?: string[];
  }>;
}

it('keeps the production generator on the CMS loopback without a startup dependency cycle', async () => {
  const { stdout } = await promisify(execFile)('docker', [
    'compose', '-f', 'compose.production.yml', 'config', '--format', 'json',
  ], {
    env: {
      ...process.env,
      ZARYA_CMS_VERSION: '0.15.0',
      ZARYA_MONGO_URI: 'mongodb://localhost:27017',
      ZARYA_MONGO_DATABASE: 'zarya_compose_contract',
      ZARYA_LOCAL_OPERATOR_ID: 'test',
      ZARYA_ADMIN_AUTH_ORIGIN: 'https://api.example.test',
      ZARYA_INSTALLATION_CPU_BUDGET: '6',
      ZARYA_UPSTREAM_HOST: 'api.example.test',
      ZARYA_BACKEND_HOST: 'api.example.test',
      ZARYA_EDGE_PROXY_SECRET: 'secret',
      MONGO_ROOT_PASSWORD: 'password',
      MONGO_APP_PASSWORD: 'password',
    },
    maxBuffer: 1024 * 1024,
  });
  const compose: IComposeServices = JSON.parse(stdout);
  const app = compose.services.app!;
  const helper = compose.services['resource-control']!;

  expect(helper.network_mode).toBe('service:app');
  expect(app.depends_on).not.toHaveProperty('resource-control');
  expect(app.command?.join(' ')).toContain('node scripts/wait-resource-helper.mjs && exec node dist/public-http.js');
});
