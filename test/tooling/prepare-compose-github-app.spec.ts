import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv, promisify } from 'node:util';

const run = promisify(execFile);

const script = path.resolve('scripts/prepare-compose.mjs');

const fragment = 'compose.github-app.yml';

describe('Compose preparation for GitHub App keys', () => {
  let root: string;
  let environment: NodeJS.ProcessEnv;

  beforeEach(async () => {
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/compose-github-app-'));
    await mkdir(path.join(root, 'admin'));
    await Promise.all(['package.json', 'package-lock.json', 'admin/package.json', 'compose.yml',
      'compose.production.yml'].map(file => copyFile(file, path.join(root, file))));
    environment = { ...process.env, ZARYA_INSTALLATION_CPU_BUDGET: '4' };
    delete environment.COMPOSE_FILE;
    delete environment.COMPOSE_PATH_SEPARATOR;
    delete environment.ZARYA_GITHUB_APP_CLIENT_ID;
    delete environment.ZARYA_GITHUB_APP_HOST_KEYS_DIR;
  });

  afterEach(async () => {
    expect(path.dirname(root)).toBe(path.resolve('.tmp'));
    await rm(root, { recursive: true, force: true });
  });

  async function prepare(): Promise<NodeJS.ProcessEnv> {
    await run(process.execPath, [script], { cwd: root, env: environment });

    return parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
  }

  it('automatically adds an app-only key mount alongside the existing production resource override', async () => {
    const keys = path.join(root, '.secrets/github-app');
    const filename = path.join(keys, 'name set by GitHub.pem');
    const initialEnv = [
      'COMPOSE_FILE=compose.production.yml' + path.delimiter + 'compose.site.yml',
      'ZARYA_GITHUB_APP_CLIENT_ID=fixture-app-id',
      'ZARYA_GITHUB_APP_KEYS_DIR=/run/secrets/github-app',
    ].join('\n');

    await mkdir(keys, { recursive: true });
    await writeFile(filename, 'fixture file');
    await writeFile(path.join(root, '.env'), initialEnv + '\n');
    const settings = await prepare();

    expect(settings.COMPOSE_FILE?.split(path.delimiter)).toEqual([
      'compose.production.yml', 'compose.site.yml', '.secrets/resources/compose.json', fragment,
    ]);
    expect((await prepare()).COMPOSE_FILE).toBe(settings.COMPOSE_FILE);
    expect(await readFile(filename, 'utf8')).toBe('fixture file');
  });

  it('adds the fragment for local Compose and detaches it when the App is disabled', async () => {
    const keys = path.join(root, 'custom keys');
    const file = path.join(root, '.env');

    await mkdir(keys);
    await writeFile(path.join(keys, 'downloaded.pem'), 'fixture file');
    await writeFile(file, 'ZARYA_GITHUB_APP_CLIENT_ID=fixture-app-id\nZARYA_GITHUB_APP_HOST_KEYS_DIR="'
      + keys.replaceAll('\\', '/') + '"\n');

    const configured = await prepare();

    expect(configured.COMPOSE_FILE?.split(path.delimiter)).toEqual(['compose.yml', fragment]);
    await writeFile(file, 'COMPOSE_FILE=' + configured.COMPOSE_FILE + '\n');
    expect((await prepare()).COMPOSE_FILE).toBe('compose.yml');
  });

  it('leaves the public-only path usable and rejects a missing configured directory before editing .env', async () => {
    expect((await prepare()).COMPOSE_FILE).toBeUndefined();
    const file = path.join(root, '.env');
    const original = 'ZARYA_GITHUB_APP_CLIENT_ID=fixture-app-id\n';

    await writeFile(file, original);
    await expect(prepare()).rejects.toMatchObject({ stderr: expect.stringContaining('GitHub App key directory') });
    expect(await readFile(file, 'utf8')).toBe(original);
  });
});
