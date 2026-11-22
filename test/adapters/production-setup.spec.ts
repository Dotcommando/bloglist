import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { initializeProduction } from '../../scripts/setup-production.mjs';

describe('production environment setup', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'zarya-production-'));
  });
  afterEach(async () => rm(directory, { recursive: true, force: true }));

  it('generates distinct installation secrets and a scoped authenticated database URI', async () => {
    await initializeProduction({
      directory,
      publicOrigin: 'https://www.example.test/',
      backendOrigin: 'https://api.example.test',
    });
    const text = await readFile(path.join(directory, '.env'), 'utf8');
    const values = Object.fromEntries(text.trim().split('\n').map((line) => {
      const separator = line.indexOf('=');

      return [line.slice(0, separator), line.slice(separator + 1)];
    }));

    expect(values.COMPOSE_FILE).toBe('compose.production.yml');
    expect(values.ZARYA_PUBLIC_ORIGIN).toBe('https://www.example.test');
    expect(values.ZARYA_ADMIN_AUTH_ORIGIN).toBe('https://api.example.test');
    expect(values.ZARYA_MONGO_URI).toContain('mongodb://zarya_app:' + values.MONGO_APP_PASSWORD + '@mongo:27017/');
    const secrets = [values.MONGO_ROOT_PASSWORD, values.MONGO_APP_PASSWORD, values.ZARYA_EDGE_PROXY_SECRET];

    expect(new Set(secrets).size).toBe(3);
    expect(secrets.every((value) => /^[a-f0-9]{64}$/.test(value ?? ''))).toBe(true);
    expect(values.CLOUDFLARE_API_TOKEN).toBe('');
  });

  it('keeps executor dumps read-only while allowing writes only to shared coordination files', async () => {
    const compose = await readFile('compose.production.yml', 'utf8');

    expect(compose).toContain('./dumps/production:/app/dumps:ro');
    expect(compose).toContain('./dumps/production/.coordination:/app/dumps/.coordination');
  });

  it('refuses to replace existing settings and their secrets', async () => {
    const input = { directory, publicOrigin: 'https://www.example.test', backendOrigin: 'https://api.example.test' };

    await initializeProduction(input);
    const original = await readFile(path.join(directory, '.env'), 'utf8');

    await expect(initializeProduction(input)).rejects.toThrow();
    expect(await readFile(path.join(directory, '.env'), 'utf8')).toBe(original);
  });

  it.each([
    ['http://www.example.test', 'https://api.example.test'],
    ['https://www.example.test/page', 'https://api.example.test'],
    ['https://www.example.test', 'https://user:password@api.example.test'],
    ['https://www.example.test', 'https://www.example.test'],
    ['https://localhost', 'https://api.example.test'],
  ])('rejects invalid production origins before writing settings: %s', async (publicOrigin, backendOrigin) => {
    await expect(initializeProduction({ directory, publicOrigin, backendOrigin })).rejects.toThrow();
    await expect(readFile(path.join(directory, '.env'))).rejects.toThrow();
  });
});
