import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { type Browser, chromium } from 'playwright-core';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { SiteAddonStatus } from '../../src/domain/addons/site-addon.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { SITE_ADDON_STORE } from '../../src/infra/addons/addons.tokens.js';
import { ADMIN_USER_UNIT_OF_WORK } from '../../src/infra/admin-users/admin-users.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { ISiteAddonStorePort } from '../../src/ports/outbound/addons/site-addon-store.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../src/ports/outbound/admin-users/admin-user-store.port.js';
import { account } from '../support/admin-users.js';
import { siteInput } from '../support/sites.js';

describe('clean CMS and generic add-on host', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let local: INestApplicationContext;
  let http: INestApplication<Server>;
  let browser: Browser | undefined;
  let root: string;
  let siteId: string;
  let base: string;
  let cookie: string;

  async function request(suffix: string, body?: unknown): Promise<Response> {
    return fetch(base + '/api/admin/sites/' + siteId + '/addons' + suffix, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        'X-Zarya-Admin': '1',
        Cookie: cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/clean-cms-'));
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    local = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      rendering: { sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts') },
    });
    siteId = (await local.get<ICreateSite>(CREATE_SITE).execute({ ...siteInput(), primaryDomain: '127.0.0.1' })).siteId;
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash('synthetic clean CMS password');

    await local.get<IAdminUserUnitOfWorkPort>(ADMIN_USER_UNIT_OF_WORK).run(async (users) => {
      await users.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    base = 'http://127.0.0.1:' + address.port;
    http = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      sourcesRoot: path.join(root, 'sources'),
      artifactsRoot: path.join(root, 'artifacts'),
      adminRoot: path.resolve('admin/dist'),
      adminAuth: { origin: base },
    });
    const login = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'X-Zarya-Admin': '1' },
      body: JSON.stringify({ email: 'user-1@example.test', password: 'synthetic clean CMS password' }),
    });

    expect(login.status).toBe(200);
    cookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? '';
    expect(cookie).not.toBe('');
  });

  afterAll(async () => {
    await browser?.close();
    await http?.close();
    await local?.close();

    if (connection) {
      if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
        throw new Error('Unsafe test database cleanup');
      }
      await connection.dropDatabase();
      await connection.close();
    }
    if (root && path.resolve(root).startsWith(path.resolve('.tmp/clean-cms-'))) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('starts with only core schemas and an empty authenticated catalogue', async () => {
    expect(await (await request('')).json()).toEqual({ items: [] });
    expect((await request('/unknown/enable', {
      expectedVersion: null, configuration: { schemaVersion: 1, values: {} },
    })).status).toBe(404);
    expect((await fetch(base + '/api/admin/sites/' + siteId + '/addons')).status).toBe(401);
    const collections = (await connection.db!.listCollections().toArray()).map((item) => item.name);

    expect(collections).toContain('site_addons');
    expect(collections).not.toContain('sessions');
    expect(collections).not.toContain('participation_requests');
    expect((await fetch(base + '/api/sessions')).status).toBe(404);
  });

  it('shows the empty add-on section in the production admin in both languages', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser executable required');
    }
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const separator = cookie.indexOf('=');

    await context.addCookies([{
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: base + '/api/admin',
      httpOnly: true,
      sameSite: 'Strict',
    }]);
    const page = await context.newPage();

    await page.goto(base + '/admin/sites/' + siteId + '/addons');
    await page.getByText('No add-ons are installed.', { exact: true }).waitFor();
    await page.locator('.admin-language select').selectOption('ru');
    await page.getByText('Нет установленных аддонов.', { exact: true }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    const target = '/admin/sites/' + siteId + '/addons/example-addon?view=day&month=2026-10&date=2026-10-28';

    await guestPage.goto(base + target);
    await guestPage.locator('#email').fill('user-1@example.test');
    await guestPage.locator('#password').fill('synthetic clean CMS password');
    await guestPage.locator('button[type="submit"]').click();
    await guestPage.waitForURL((url) => url.pathname.endsWith('/addons/example-addon'));
    expect(guestPage.url()).toBe(base + target);
    await guest.close();
  });

  it('retains disabled metadata when the corresponding code is absent', async () => {
    const store = local.get<ISiteAddonStorePort>(SITE_ADDON_STORE);
    const state = await store.commit({
      siteAddonId: randomUUID(),
      siteId,
      addonKey: 'example-addon',
      status: SiteAddonStatus.Disabled,
      configuration: { schemaVersion: 1, values: {} },
      version: 'captured',
      createdAt: new Date('2026-10-28T10:00:00Z'),
      updatedAt: new Date('2026-10-28T10:00:00Z'),
      createdBy: 'operator',
      updatedBy: 'operator',
    }, null);
    const view = await (await request('/example-addon')).json();

    expect(view.definition).toBeNull();
    expect(view.connection.siteAddonId).toBe(state.siteAddonId);
    expect((await request('/example-addon/disable', { expectedVersion: state.version })).status).toBe(200);
    expect((await request('/example-addon/enable', {
      expectedVersion: state.version, configuration: { schemaVersion: 1, values: {} },
    })).status).toBe(404);
  });
});
