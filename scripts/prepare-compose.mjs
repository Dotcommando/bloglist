import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseEnv, promisify } from 'node:util';

import { githubAppComposeFile, prepareGitHubAppCompose } from './prepare-github-app-compose.mjs';
import { verifyReleaseConsistency } from './release-consistency.mjs';

const root = process.cwd();

const { version } = await verifyReleaseConsistency(root);

const envPath = path.join(root, '.env');

let existing = '';

try {
  existing = await readFile(envPath, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

const environment = { ...parseEnv(existing), ...process.env };

const production = (environment.COMPOSE_FILE ?? '').includes('production');

let capacity = Number(environment.ZARYA_INSTALLATION_CPU_BUDGET || os.availableParallelism());

if (production && !environment.ZARYA_INSTALLATION_CPU_BUDGET) {
  const { stdout } = await promisify(execFile)('docker', ['info', '--format', '{{.NCPU}}']);

  capacity = Number(stdout.trim());
}

if (!Number.isFinite(capacity) || capacity <= 0) {
  throw new Error('Valid installation CPU capacity is required');
}

const infrastructureCpu = Number(environment.ZARYA_INFRASTRUCTURE_CPU_RESERVE ?? 0);

if (!Number.isFinite(infrastructureCpu) || infrastructureCpu < 0 || infrastructureCpu >= capacity) {
  throw new Error('Infrastructure reserve must leave positive installation capacity');
}

const available = capacity - infrastructureCpu;

if (available > 1 && available < 1.1) {
  throw new Error('At least 0.1 CPU must remain for the CMS after the default database allocation');
}

const settings = {
  ZARYA_CMS_VERSION: version,
  ZARYA_INSTALLATION_CPU_BUDGET: String(capacity),
  ZARYA_INFRASTRUCTURE_CPU_RESERVE: environment.ZARYA_INFRASTRUCTURE_CPU_RESERVE ?? '0',
};

const override = '.secrets/resources/compose.json';

const githubApp = await prepareGitHubAppCompose(root, environment, production);

const separator = environment.COMPOSE_PATH_SEPARATOR ?? path.delimiter;

const configuredFiles = (environment.COMPOSE_FILE ?? '').split(separator).filter(Boolean);

if (production || githubApp || configuredFiles.includes(githubAppComposeFile)) {
  const files = configuredFiles.filter(file => file !== githubAppComposeFile && (!production || file !== override));

  if (!files.length) {
    files.push('compose.yml');
  }
  if (production) {
    files.push(override);
  }
  if (githubApp) {
    files.push(githubAppComposeFile);
  }
  settings.COMPOSE_FILE = files.join(separator);
}

for (const [name, value] of Object.entries(settings)) {
  const pattern = new RegExp('^' + name + '=.*$', 'm');

  existing = pattern.test(existing) ? existing.replace(pattern, name + '=' + value)
    : existing.replace(/\s*$/, '\n') + name + '=' + value + '\n';
}

await writeFile(envPath, existing, { mode: 0o600 });

await mkdir(path.join(root, '.secrets/resources'), { recursive: true, mode: 0o700 });

try {
  await writeFile(path.join(root, '.secrets/resources/key'), randomBytes(32).toString('hex') + '\n',
    { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error?.code !== 'EEXIST') {
    throw error;
  }
}

try {
  await writeFile(path.join(root, override), JSON.stringify({
    services: {
      app: { cpus: available <= 1 ? available : Number((available - 1).toFixed(1)) },
      mongo: { cpus: Math.min(1, available) },
    },
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error?.code !== 'EEXIST') {
    throw error;
  }
}

console.info('Prepared Compose release ' + version + '. Existing credentials and resource limits were preserved.');
