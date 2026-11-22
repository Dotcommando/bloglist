import 'reflect-metadata';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';

import { DumpDatabase } from '../../src/adapters/outbound/backup/mongoose/dump-database.adapter.js';
import {
  MongooseAddonInstallationStore,
} from '../../src/adapters/outbound/persistence/mongoose/addons/addon-installation-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { packAddonArchive } from '../../src/adapters/outbound/runtime/addons/addon-package-archive.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AddonInstallationStatus } from '../../src/domain/addons/addon-installation.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { ADMIN_USER_UNIT_OF_WORK } from '../../src/infra/admin-users/admin-users.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../src/ports/outbound/admin-users/admin-user-store.port.js';
import { account } from '../support/admin-users.js';
import { siteInput } from '../support/sites.js';

describe('repository add-on installation through the real CMS', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const password = 'synthetic repository installation password';
  let connection: Connection;
  let local: INestApplicationContext;
  let http: INestApplication<Server>;
  let root: string;
  let siteId: string;
  let secondSiteId: string;
  let base: string;
  let cookie: string;
  let settings: Parameters<typeof createPublicHttpApplication>[0];
  let assetRequests = 0;
  let repositoryRequests = 0;
  let releaseDownload: (() => void) | null = null;
  let holdDownload = false;

  async function request(site: string, suffix: string, body?: unknown): Promise<Response> {
    return fetch(base + '/api/admin/sites/' + site + suffix, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'X-Zarya-Admin': '1', Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/repository-installation-'));
    connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    local = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      dumpsRoot: path.join(root, 'dumps'),
      rendering: { sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts') },
    });
    const createSite = local.get<ICreateSite>(CREATE_SITE);

    siteId = (await createSite.execute({ ...siteInput(), primaryDomain: '127.0.0.1' })).siteId;
    secondSiteId = (await createSite.execute({
      ...siteInput(), mark: 'secondary', primaryDomain: 'secondary.example.test',
    })).siteId;
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await local.get<IAdminUserUnitOfWorkPort>(ADMIN_USER_UNIT_OF_WORK).run(async (users) => {
      await users.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });

    const source = path.join(root, 'release-source');
    const contents = {
      'server/runtime.cjs': `exports.validateConfiguration = value => {
  if (value.schemaVersion !== 1) throw new Error('invalid configuration');
};
exports.defaultConfiguration = () => ({schemaVersion: 1, values: {}});
exports.createRuntime = async () => ({canHandle: () => false, handle: async () => {}});
`,
      'migrations/0000-runtime.json': JSON.stringify({ id: '0000-runtime', collections: [] }),
    };

    for (const [name, value] of Object.entries(contents)) {
      await mkdir(path.dirname(path.join(source, name)), { recursive: true });
      await writeFile(path.join(source, name), value);
    }
    await writeFile(path.join(source, 'addon.runtime.json'), JSON.stringify({
      format: 'zarya-addon',
      version: 1,
      cmsVersion: '0.8.0',
      collections: [],
      dependencies: {},
      definition: {
        addonKey: 'repository-addon',
        implementationVersion: '1.0.0',
        contractVersion: 1,
        configurationSchemaVersion: 1,
        adminComponentId: null,
        snippetIds: [],
        name: { en: 'Repository test add-on', ru: 'Тестовый аддон' },
        description: { en: 'Synthetic release', ru: 'Синтетический релиз' },
      },
      files: Object.fromEntries(Object.entries(contents).map(([name, content]) =>
        [name, createHash('sha256').update(content).digest('hex')])),
      serverEntry: 'server/runtime.cjs',
      adminEntry: null,
      styles: [],
    }));
    await packAddonArchive(source, path.join(root, 'addon.runtime.gz'));
    const archive = new Uint8Array(await readFile(path.join(root, 'addon.runtime.gz')));
    const nativeFetch = globalThis.fetch;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.startsWith('http://127.0.0.1:')) {
        return nativeFetch(input, init);
      }
      if (!url.startsWith('https://api.github.com/repos/')) {
        throw new Error('Tests must never contact external services');
      }
      repositoryRequests++;

      if (url.includes('/missing/addon/')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('/commits/')) {
        return Response.json({ sha: 'a'.repeat(40) });
      }
      if (url.includes('/releases/assets/')) {
        assetRequests++;

        if (holdDownload) {
          await new Promise<void>((resolve) => {
            releaseDownload = resolve;
          });
        }

        return new Response(archive);
      }

      return Response.json({
        tag_name: 'v1.0.0',
        draft: false,
        prerelease: false,
        assets: [{
          id: 123,
          name: 'addon.runtime.gz',
          state: 'uploaded',
          size: archive.length,
          digest: 'sha256:' + createHash('sha256').update(archive).digest('hex'),
        }],
      });
    });
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    base = 'http://127.0.0.1:' + address.port;
    settings = {
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      sourcesRoot: path.join(root, 'sources'),
      artifactsRoot: path.join(root, 'artifacts'),
      dumpsRoot: path.join(root, 'dumps'),
      adminRoot: path.resolve('admin/dist'),
      adminAuth: { origin: base },
    };
    http = await createPublicHttpApplication(settings);
    const login = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'X-Zarya-Admin': '1' },
      body: JSON.stringify({ email: 'user-1@example.test', password }),
    });

    expect(login.status).toBe(200);
    cookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? '';
    expect(cookie).not.toBe('');
  });

  afterAll(async () => {
    releaseDownload?.();
    vi.restoreAllMocks();
    await http?.close();
    await local?.close();

    if (connection) {
      try {
        expect(connection.name).toBe(database);
        expect(database).toMatch(/^zarya_test_[a-f0-9]{32}$/);
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (root) {
      expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unfinished unauthorized requests and unknown sites before repository access', async () => {
    let client!: ReturnType<typeof httpRequest>;
    const response = new Promise<number>((resolve, reject) => {
      client = httpRequest(base + '/api/admin/sites/' + siteId + '/addon-installations', {
        method: 'POST',
        headers: {
          Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', 'Content-Length': 1000000,
        },
      }, (result) => {
        result.resume();
        result.once('end', () => resolve(result.statusCode ?? 0));
      });
      client.on('error', reject);
      client.flushHeaders();
    });

    try {
      expect(await response).toBe(401);
      expect((await request('missing-site', '/addon-installations', {
        repositoryUrl: 'https://github.com/example/repository-addon',
      })).status).toBe(404);
      expect(repositoryRequests).toBe(0);
      expect(await connection.db!.collection('addon_installations').countDocuments()).toBe(0);
    } finally {
      client.destroy();
    }
  });

  it('enforces immutable concurrent package claims and global dump isolation in MongoDB', async () => {
    const store = new MongooseAddonInstallationStore(connection);
    const candidate = {
      installationId: 'claim-one',
      repositoryUrl: 'https://github.com/example/metadata',
      releaseTag: 'v1',
      sourceCommit: 'a'.repeat(40),
      artifactChecksum: 'b'.repeat(64),
      runtimeDigest: 'c'.repeat(64),
      addonKey: 'metadata',
      implementationVersion: '1.0.0',
      cmsVersion: '0.8.0',
      status: AddonInstallationStatus.Pending,
      createdAt: new Date('2026-11-01T12:00:00Z'),
      installedAt: null,
      installedBy: 'admin',
    };

    try {
      const outcomes = await Promise.allSettled([
        store.reserve(candidate),
        store.reserve({ ...candidate, installationId: 'claim-two', repositoryUrl: 'https://github.com/other/metadata' }),
      ]);

      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const [saved] = await store.list();
      const installed = await store.complete(saved!.installationId, saved!.runtimeDigest,
        new Date('2026-11-01T12:01:00Z'));

      expect(await store.complete(saved!.installationId, saved!.runtimeDigest,
        new Date('2026-11-01T12:02:00Z'))).toEqual(installed);
      expect((await new DumpDatabase(connection).schema()).collections).not.toContain('addon_installations');
      const raw = connection.db!.collection<Record<string, unknown> & { _id: string }>('addon_installations');
      const { installationId, ...fields } = candidate;

      await expect(raw.insertOne({
        ...fields,
        _id: installationId + '-invalid',
        addonKey: 'invalid-metadata',
        repositoryUrl: 'https://github.com/invalid/metadata',
        status: 'Installed',
        installedAt: null,
      })).rejects.toMatchObject({ code: 121 });
    } finally {
      await store.model.deleteMany({}).exec();
    }
  });

  function resumeDownload(): void {
    if (!releaseDownload) {
      throw new Error('Expected the release download to be pending');
    }
    releaseDownload();
  }

  it('installs from the built Add-ons page, stays disabled for both sites and survives restart', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        url: base + '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      await page.goto(base + '/admin/sites/' + siteId + '/addons');
      await page.locator('.admin-language select').selectOption('en');
      await page.getByText('No add-ons are installed.', { exact: true }).waitFor();
      await page.getByLabel('GitHub repository').fill('https://github.com/example/repository-addon');
      await page.getByLabel('GitHub repository').focus();
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'Install', exact: true })
        .evaluate((element) => element.matches(':focus')), 'Install receives keyboard focus').toBe(true);
      holdDownload = true;
      await page.getByRole('button', { name: 'Install', exact: true }).click();
      const install = page.locator('._addon-install');

      await install.getByRole('status').filter({ hasText: 'Downloading and installing' })
        .locator('._saving-spinner').waitFor();
      expect(await page.getByRole('button', { name: 'Install', exact: true }).isDisabled()).toBe(true);

      for (let count = 0; !releaseDownload && count < 100; count++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      expect(releaseDownload).not.toBeNull();
      resumeDownload();
      holdDownload = false;
      await page.locator('._addon-card').filter({ hasText: 'Repository test add-on' }).waitFor();
      expect(await page.locator('._addon-card .cms-badge').textContent()).toContain('Disabled');

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        if (width === 390 || width === 1440) {
          const group = page.locator('._addon-actions');
          const firstAction = await group.getByRole('button').first().boundingBox();
          const reference = await (width === 1440
            ? page.getByRole('heading', { name: 'Repository test add-on' }) : group).boundingBox();

          expect(firstAction).not.toBeNull();
          expect(reference).not.toBeNull();
          expect(Math.abs(firstAction!.y - reference!.y), `action top at ${width}px`).toBeLessThan(1);
        }
      }
      await page.setViewportSize({ width: 320, height: 360 });
      const pane = page.locator('._addon-scroll');

      await pane.evaluate((element) => {
        element.scrollTop = 40;
      });
      await page.locator('._addon-scroll[data-scrolled="true"]').waitFor();
      const toolbar = page.locator('.addons-workspace > ._workspace-toolbar');

      expect(await toolbar.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
      await pane.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.locator('._addon-scroll[data-scrolled="false"]').waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByLabel('GitHub repository').fill('https://github.com/missing/addon');
      await page.getByRole('button', { name: 'Install', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'stable release was not found' }).waitFor();
      const record = { addonKey: 'repository-addon' };

      // Model an existing runtime installed from a file before repository linking was available.
      expect((await connection.db!.collection('addon_installations').deleteOne(record)).deletedCount).toBe(1);
      await page.reload();
      const card = page.locator('._addon-card').filter({ hasText: 'Repository test add-on' });

      await card.getByText('Update source not connected', { exact: true }).waitFor();
      expect(await card.getByRole('button', { name: 'Check for updates' }).count()).toBe(0);
      const wrong = await request(siteId, '/addon-installations', {
        repositoryUrl: 'https://github.com/example/repository-addon', installedAddonKey: 'other-addon',
      });

      expect(wrong.status).toBe(409);
      expect(await connection.db!.collection('addon_installations').countDocuments(record)).toBe(0);
      await card.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
      await card.getByLabel('GitHub repository').fill('https://github.com/example/repository-addon');
      holdDownload = true;
      releaseDownload = null;
      await card.getByRole('button', { name: 'Connect source', exact: true }).click();
      await card.getByRole('status').filter({ hasText: 'Connecting GitHub' }).locator('._saving-spinner').waitFor();

      for (let count = 0; !releaseDownload && count < 100; count++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      expect(releaseDownload).not.toBeNull();
      resumeDownload();
      holdDownload = false;
      await card.getByRole('link', { name: 'example/repository-addon', exact: true }).waitFor();
      expect(await card.locator('._saving-spinner').count()).toBe(0);
      await card.getByRole('button', { name: 'Check for updates', exact: true }).waitFor();
      expect(await card.locator('.cms-badge').textContent()).toContain('Disabled');

      await page.locator('.admin-language select').selectOption('ru');
      await page.getByLabel('Репозиторий GitHub').waitFor();
    } finally {
      releaseDownload?.();
      await context.close();
      await browser.close();
    }
    const originalRequests = assetRequests;
    const repeated = await request(siteId, '/addon-installations', {
      repositoryUrl: 'https://github.com/Example/Repository-Addon.git',
    });

    expect(repeated.status).toBe(200);
    expect(assetRequests).toBe(originalRequests);

    for (const targetSite of [siteId, secondSiteId]) {
      const result = await request(targetSite, '/addons');
      const data: unknown = await result.json();

      expect(data).toMatchObject({ items: [{ addonKey: 'repository-addon', connection: null }] });
    }
    await http.close();
    http = await createPublicHttpApplication(settings);
    const restored = await request(secondSiteId, '/addon-installations');

    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ items: [{ addonKey: 'repository-addon', status: 'Installed' }] });
    expect((await request(secondSiteId, '/addons')).status).toBe(200);
    expect(assetRequests).toBe(originalRequests);
  }, 60000);
});
