import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { type Browser, chromium, type Page } from 'playwright-core';

import { readAdminPublicAssets } from '../../src/adapters/inbound/documents/http/admin/admin-asset-manifest.js';
import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { account } from '../support/admin-users.js';

describe('built Svelte administration with real authentication', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const password = 'synthetic frontend password';
  let connection: Connection;
  let app: INestApplication<Server>;
  let browser: Browser;
  let origin: string;
  let root: string;

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!mongoUri || !executablePath) {
      throw new Error('Explicit test MongoDB and browser required');
    }
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/admin-frontend-'));
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    const store = new MongooseAdminUserStore(connection);
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await store.run(async (users) => {
      await users.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing port');
    }
    await new Promise<void>((resolve) => {
      probe.close(() => {
        resolve();
      });
    });
    origin = 'http://127.0.0.1:' + address.port;
    app = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      artifactsRoot: path.join(root, 'artifacts'),
      sourcesRoot: path.join(root, 'sources'),
      dumpsRoot: path.join(root, 'dumps'),
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
    });
    browser = await chromium.launch({ executablePath, headless: true });
  });
  afterAll(async () => {
    await browser?.close();
    await app?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Unsafe test database');
        }
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
  async function openAdmin(page: Page, url: string): Promise<void> {
    await page.goto(url);
    await page.locator('.admin-language select').selectOption('ru');
  }

  async function submit(page: Page, secret = password): Promise<void> {
    await page.getByLabel('Email', { exact: true }).fill('user-1@example.test');
    await page.getByLabel('Пароль', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Войти', exact: true }).click({ noWaitAfter: true });
  }
  it('keeps workspace dependencies private before login and after logout, including direct GET and HEAD', async () => {
    const { version }: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));
    const publicAssets = await readAdminPublicAssets(path.resolve('admin/dist'));
    const manifest: Record<string, { file: string; css?: string[] }> = JSON.parse(
      await readFile('admin/dist/.vite/manifest.json', 'utf8'));
    const allAssets = [...new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? [])]))];
    const privateAssets = allAssets.filter((asset) => !publicAssets.has(asset));

    expect(privateAssets.some((asset) => asset.endsWith('.js'))).toBe(true);
    expect(privateAssets.some((asset) => asset.endsWith('.css'))).toBe(true);

    for (const asset of publicAssets) {
      const response = await fetch(origin + '/admin/' + asset);

      expect(response.status, asset).toBe(200);

      if (asset.endsWith('.js')) {
        const source = await response.text();

        expect(source).not.toContain('/api/admin/sites');
        expect(source).not.toContain('/api/admin/users');
        expect(source).not.toContain('/api/admin/installation');
      }
    }

    for (const asset of privateAssets) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(origin + '/admin/' + asset, { method });

        expect(response.status, method + asset).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
      }
    }
    expect((await fetch(origin + '/admin/.vite/manifest.json')).status).toBe(404);
    const context = await browser.newContext();
    const page = await context.newPage();
    const requested: string[] = [];

    page.on('request', (request) => requested.push(new URL(request.url()).pathname));

    try {
      await openAdmin(page, origin + '/admin/login');
      await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();

      for (const asset of privateAssets) {
        expect(requested).not.toContain('/admin/' + asset);
      }
      await submit(page);
      await page.waitForURL('**/admin/sites/new');
      await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();

      await page.getByText('CMS Zarya v.' + version, { exact: true }).waitFor();

      for (const asset of privateAssets) {
        const response = await context.request.get(origin + '/admin/' + asset);

        expect(response.status(), asset).toBe(200);
        expect(response.headers()['cache-control']).toBe('no-store');
      }
      const cookies = await context.cookies();

      expect(cookies.some((cookie) => cookie.name === 'zarya_admin_ui_session'
        && cookie.path === '/admin' && cookie.httpOnly)).toBe(true);
      expect(cookies.some((cookie) => cookie.name === 'zarya_admin_session'
        && cookie.path === '/api/admin' && cookie.httpOnly)).toBe(true);
      const status = await page.evaluate(async () => (await fetch('/api/admin/auth/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zarya-Admin': '1' }, body: '{}',
      })).status);

      expect(status).toBe(204);
      const stale = cookies.find((cookie) => cookie.name === 'zarya_admin_ui_session')!;

      for (const asset of privateAssets) {
        expect((await context.request.get(origin + '/admin/' + asset, {
          headers: { Cookie: stale.name + '=' + stale.value },
        })).status()).toBe(401);
        expect((await context.request.get(origin + '/admin/' + asset)).status()).toBe(401);
      }
    } finally {
      await context.close();
    }
  });
  it('logs out from the square header button and keeps the session on a failed request', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.setDefaultTimeout(4000);

    try {
      await openAdmin(page, origin + '/admin/login');
      await submit(page);
      await page.waitForURL('**/admin/sites/new');
      const button = page.getByRole('button', { name: 'Выйти', exact: true });

      await button.waitFor();
      expect(await button.getAttribute('title')).toBe('Выйти');
      expect(await button.locator('svg[aria-hidden="true"]').count()).toBe(1);
      await page.locator('.admin-language select').focus();
      await page.keyboard.press('Tab');
      expect(await button.evaluate((element) => element === document.activeElement)).toBe(true);
      await page.locator('.admin-language select').selectOption('en');
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.locator('.admin-language select').selectOption('ru');

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const language = await page.locator('.admin-language select').boundingBox();
        const box = await button.boundingBox();

        expect(box!.width).toBe(44);
        expect(box!.height).toBe(44);
        expect(box!.x).toBeGreaterThanOrEqual(language!.x + language!.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.route('**/api/admin/auth/logout', (route) => route.fulfill({ status: 503 }));
      await button.click();
      await page.getByText('Не удалось выйти. Повторите попытку.', { exact: true }).waitFor();
      expect(page.url()).toContain('/admin/sites/new');
      expect(await button.isEnabled()).toBe(true);
      expect((await context.request.get(origin + '/api/admin/auth/me')).status()).toBe(200);
      await page.unroute('**/api/admin/auth/logout');
      const response = page.waitForResponse((response) => response.url().endsWith('/api/admin/auth/logout'));

      await button.click();
      expect((await response).status()).toBe(204);
      await page.waitForURL('**/admin/login');
      await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();
      expect((await context.cookies()).some((cookie) =>
        ['zarya_admin_session', 'zarya_admin_ui_session'].includes(cookie.name))).toBe(false);
      expect((await context.request.get(origin + '/api/admin/auth/me')).status()).toBe(401);
    } finally {
      await context.close();
    }
  });
  it('recovers from a private module download failure without repeating login', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    let logins = 0;

    page.setDefaultTimeout(4000);

    page.on('request', (request) => {
      if (request.url().endsWith('/api/admin/auth/login')) {
        logins++;
      }
    });

    try {
      await openAdmin(page, origin + '/admin/login');
      await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();
      await page.route('**/assets/AdminWorkspace-*.js', (route) => route.abort());
      await submit(page);
      await page.getByRole('heading', { name: 'Нет соединения' }).waitFor();
      await page.unroute('**/assets/AdminWorkspace-*.js');
      await page.getByRole('button', { name: 'Повторить' }).click();
      await page.waitForURL('**/admin/sites/new');
      await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();

      expect(logins).toBe(1);
    } catch (error) {
      throw new Error(String(error) + ' ' + page.url() + ' ' + await page.locator('body').innerText());
    } finally {
      await context.close();
    }
  });
  it('offers the first site after login or reload at a stale installation deep link', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const previousSite = 'previous-installation';
    const stalePath = '/admin/sites/' + previousSite + '/addons/participation?view=calendar&date=2030-01-01';

    await context.addCookies([{
      name: 'zarya_admin_site', value: previousSite, domain: new URL(origin).hostname, path: '/admin',
    }]);
    await openAdmin(page, origin + stalePath);
    await page.waitForURL('**/admin/login');
    await submit(page);
    await page.waitForURL('**/admin/sites/new', { timeout: 3000 });
    await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();
    expect((await context.cookies()).some((cookie) => cookie.name === 'zarya_admin_site')).toBe(false);
    await page.goto(origin + stalePath);
    await page.waitForURL('**/admin/sites/new', { timeout: 3000 });
    await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();
    await page.route('**/api/admin/sites', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
    await page.goto(origin + stalePath);
    await page.getByRole('alert').waitFor();
    expect(page.url()).toBe(origin + stalePath);
    expect(await page.getByRole('heading', { name: 'Создайте первый сайт' }).count()).toBe(0);
    await context.close();
  });
  it('logs in, persists a session and returns to login after logout', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await openAdmin(page, origin + '/admin/');
    await page.waitForURL('**/admin/login');
    await submit(page, 'incorrect password');
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('alert').textContent()).toContain('Неверный email или пароль');
    await page.getByRole('button', { name: 'Показать пароль' }).click();
    expect(await page.getByLabel('Пароль', { exact: true }).getAttribute('type')).toBe('text');
    await page.getByRole('button', { name: 'Скрыть пароль' }).click();
    await submit(page);
    await page.waitForURL('**/admin/sites/new');
    await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();
    await page.reload();
    await page.getByRole('main', { name: 'Администрирование' }).waitFor();
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['zarya.admin.language', 'ru']]);
    expect(await page.evaluate(() => document.cookie)).not.toContain('zarya_admin_session');
    const state = await context.storageState();

    await context.close();
    const restored = await browser.newContext({ storageState: state });
    const restoredPage = await restored.newPage();

    await restoredPage.goto(origin + '/admin/login');
    await restoredPage.waitForURL('**/admin/sites/new');
    const status = await restoredPage.evaluate(async () => (await fetch('/api/admin/auth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zarya-Admin': '1' }, body: '{}',
    })).status);

    expect(status).toBe(204);
    await restoredPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await restoredPage.waitForURL('**/admin/login');
    expect(errors).toEqual([]);
    await restored.close();
  });
  it('fits mobile and desktop widths and supports keyboard and recovery from network errors', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.route('**/api/admin/auth/me', (route) => route.abort());
    await openAdmin(page, origin + '/admin/');
    await page.getByRole('heading', { name: 'Нет соединения' }).waitFor();
    await page.unroute('**/api/admin/auth/me');
    await page.getByRole('button', { name: 'Повторить' }).click();
    await page.waitForURL('**/admin/login');

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 820 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByLabel('Email', { exact: true }).focus();
    await page.keyboard.press('Tab');
    expect(await page.getByLabel('Пароль', { exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
    await page.route('**/api/admin/auth/login', (route) => route.fulfill({
      status: 429, headers: { 'Retry-After': '120' },
    }));
    await submit(page);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('alert').textContent()).toContain('через 2 мин.');
    await page.unroute('**/api/admin/auth/login');
    await page.route('**/api/admin/auth/login', (route) => route.abort());
    await submit(page);
    await page.waitForFunction(() => document.querySelector('[role="alert"]')
      ?.textContent?.includes('Не удалось войти'));
    expect(await page.getByRole('button', { name: 'Войти', exact: true }).isEnabled()).toBe(true);
    await context.close();
  });
  it('cancels an old session check before login so a stale 401 cannot clear the new cookie', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await openAdmin(page, origin + '/admin/login');
    await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();
    let release = (): void => {};
    let observed = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const captured = new Promise<void>((resolve) => {
      observed = resolve;
    });

    await page.route('**/api/admin/auth/me', async (route) => {
      const response = await route.fetch();

      observed();
      await held;
      await route.fulfill({ response });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await captured;
    const cancelled = page.waitForEvent('requestfailed', {
      predicate: (request) => request.url().endsWith('/api/admin/auth/me'),
    });

    await submit(page);
    await cancelled;
    await page.waitForURL('**/admin/sites/new');
    release();
    await page.waitForLoadState('networkidle');
    await page.unroute('**/api/admin/auth/me');
    expect(page.url()).toBe(origin + '/admin/sites/new');
    await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();
    expect(await page.evaluate(async () => (await fetch('/api/admin/auth/me')).status)).toBe(200);
    await context.close();
  });
  it('creates sites and draft pages through the desktop workspace with site isolation', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

    context.setDefaultTimeout(5000);
    const page = await context.newPage();
    const runtimeErrors: string[] = [];

    page.on('pageerror', (error) => {
      runtimeErrors.push(error.message);
    });

    await openAdmin(page, origin + '/admin/');
    await submit(page);
    await page.getByRole('heading', { name: 'Создайте первый сайт' }).waitFor();
    await page.getByLabel('Название сайта', { exact: true }).fill('Workspace Alpha');
    await page.getByLabel('Домен', { exact: true }).fill('alpha.example.test');
    await chooseLocalSiteOrigin(page);
    await page.getByLabel('Ключ сайта').fill('WorkspaceAlpha');
    await page.getByLabel('Основной язык сайта').fill('en');
    expect(await page.locator('.cms-form input').evaluateAll((elements) => elements.flatMap((element) =>
      element instanceof HTMLInputElement && !element.validity.valid ? [element.id + ': ' + element.validationMessage]
        : []))).toEqual([]);
    const siteSaved = page.waitForResponse((response) => response.url().endsWith('/api/admin/sites')
      && response.request().method() === 'POST');

    await page.getByRole('button', { name: 'Создать сайт', exact: true }).click();
    expect(runtimeErrors).toEqual([]);
    expect((await siteSaved).status()).toBe(201);
    await page.getByRole('button', { name: 'Создать главную страницу' }).waitFor();
    expect(await page.getByRole('treeitem').count()).toBe(0);
    const drawer = await page.locator('#page-drawer').boundingBox();
    const workspace = await page.locator('#page-workspace').boundingBox();

    expect(drawer?.width).toBe(286);
    expect(Math.round((drawer?.y ?? 0) + (drawer?.height ?? 0))).toBe(960);
    expect(workspace?.x).toBe(drawer ? drawer.x + drawer.width : -1);
    expect(workspace?.width).toBeGreaterThan(drawer?.width ?? 0);
    await page.getByRole('button', { name: 'Создать главную страницу' }).click();
    await page.getByRole('heading', { name: 'Создание главной страницы' }).waitFor();
    await page.getByLabel('Название страницы').fill('Alpha Home');
    await page.getByLabel('Содержимое', { exact: true }).fill('# Alpha draft');
    const created = page.waitForResponse((response) => response.url().endsWith('/pages')
      && response.request().method() === 'POST');

    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    const response = await created;

    expect(response.status()).toBe(201);
    const body: unknown = await response.json();

    if (
      !body
      || typeof body !== 'object'
      || !('pageId' in body)
      || typeof body.pageId !== 'string'
      || !('siteId' in body)
      || typeof body.siteId !== 'string'
    ) {
      throw new Error('Missing page identity');
    }

    const alphaPageId = body.pageId;

    expect(body).toMatchObject({ status: 'DRAFT', publishedAt: null });
    await page.getByRole('treeitem', { name: /Alpha Home/ }).waitFor();
    const drawerAfterSave = (await page.locator('#page-drawer').boundingBox())!;

    expect(Math.round(drawerAfterSave.y + drawerAfterSave.height)).toBe(960);
    await page.getByRole('button', { name: 'Все сайты', exact: true }).click();
    await page.getByRole('button', { name: 'Создать сайт', exact: true }).click();
    await page.getByLabel('Название сайта', { exact: true }).fill('Workspace Beta');
    await page.getByLabel('Домен', { exact: true }).fill('beta.example.test');
    await chooseLocalSiteOrigin(page, 'http://localhost:3001');
    await page.getByLabel('Ключ сайта').fill('WorkspaceBeta');
    await page.getByLabel('Основной язык сайта').fill('en');
    const betaCreated = page.waitForResponse((result) => result.url().endsWith('/api/admin/sites')
      && result.request().method() === 'POST');

    await page.getByRole('button', { name: 'Создать сайт', exact: true }).click();
    const beta: unknown = await (await betaCreated).json();

    if (!beta || typeof beta !== 'object' || !('siteId' in beta) || typeof beta.siteId !== 'string') {
      throw new Error('Missing site identity');
    }
    await page.getByRole('button', { name: 'Создать главную страницу' }).waitFor();
    expect(await page.getByRole('treeitem').count()).toBe(0);
    expect((await context.request.get(origin + '/api/admin/sites/' + beta.siteId + '/pages/' + alphaPageId)).status())
      .toBe(404);
    await page.reload();
    await page.getByRole('button', { name: 'Все сайты', exact: true }).click();
    await page.getByRole('heading', { name: 'Сайты', exact: true }).waitFor();
    await page.getByRole('button', { name: /Workspace Alpha/ }).click();
    await page.getByRole('treeitem', { name: /Alpha Home/ }).click();
    await page.getByLabel('Содержимое', { exact: true }).waitFor();
    expect(await page.getByLabel('Содержимое', { exact: true }).inputValue()).toBe('# Alpha draft');
    await page.getByLabel('Содержимое', { exact: true }).fill('# Edited alpha draft');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.getByText('Черновик сохранён', { exact: true }).first().waitFor();
    await page.waitForURL(/\/admin\/sites\/[^/]+$/);
    await page.reload();
    await page.getByRole('treeitem', { name: /Alpha Home/ }).click();
    expect(await page.getByLabel('Содержимое', { exact: true }).inputValue()).toBe('# Edited alpha draft');
    await context.close();
  });
  it('slides full-width mobile panels, keeps form values and makes the inactive panel inert', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

    context.setDefaultTimeout(5000);
    const page = await context.newPage();

    await openAdmin(page, origin + '/admin/sites');
    await submit(page);
    await page.getByRole('button', { name: /Workspace Beta/ }).click();
    await page.getByRole('button', { name: 'Создать главную страницу' }).waitFor();
    expect(await page.locator('#page-workspace').getAttribute('inert')).not.toBeNull();

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991]) {
      await page.setViewportSize({ width, height: 844 });
      const box = await page.locator('#page-drawer').boundingBox();

      expect(Math.round(box?.width ?? 0)).toBe(width);
      expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
      expect(Math.round(box?.x ?? -1)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Создать главную страницу' }).click();
    await page.getByRole('heading', { name: 'Создание главной страницы' }).waitFor();
    expect(await page.locator('#page-drawer').getAttribute('inert')).not.toBeNull();
    expect(Math.round((await page.locator('#page-workspace').boundingBox())?.x ?? -1)).toBe(0);
    await page.getByLabel('Название страницы').fill('Mobile draft');
    await page.getByLabel('Содержимое', { exact: true }).fill('Preserved while switching');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Открыть дерево страниц' }).click();
    await page.getByRole('button', { name: 'Открыть рабочую область' }).click();
    expect(await page.getByLabel('Название страницы').inputValue()).toBe('Mobile draft');
    expect(await page.getByLabel('Содержимое', { exact: true }).inputValue()).toBe('Preserved while switching');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.getByText('Черновик сохранён', { exact: true }).first().waitFor();
    await page.waitForURL(/\/admin\/sites\/[^/]+$/);
    await page.getByRole('treeitem', { name: /Mobile draft/ }).click();
    expect(await page.getByLabel('Содержимое', { exact: true }).inputValue()).toBe('Preserved while switching');
    await page.setViewportSize({ width: 992, height: 844 });
    await page.waitForFunction(() => !document.getElementById('page-drawer')?.hasAttribute('inert')
      && !document.getElementById('page-workspace')?.hasAttribute('inert'));
    expect(await page.locator('#page-drawer').getAttribute('inert')).toBeNull();
    expect(await page.locator('#page-workspace').getAttribute('inert')).toBeNull();
    await context.close();
  });

  it('moves both mobile panels together throughout the slide', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

    context.setDefaultTimeout(5000);
    const page = await context.newPage();

    await openAdmin(page, origin + '/admin/sites');
    await submit(page);
    await page.getByRole('button', { name: /Workspace Beta/ }).click();
    await page.getByRole('button', { name: 'Открыть рабочую область' }).waitFor();
    const measurements = await page.evaluate(async () => {
      const drawer = document.getElementById('page-drawer');
      const workspace = document.getElementById('page-workspace');
      const toggle = document.querySelector('#page-drawer [aria-label="Открыть рабочую область"]');

      if (!drawer || !workspace || !(toggle instanceof HTMLButtonElement)) {
        throw new Error('Missing panels');
      }
      toggle.click();
      const samples: { left: number; right: number; workspace: number }[] = [];
      const started = performance.now();

      await new Promise<void>((resolve) => {
        const sample = (): void => {
          const box = drawer.getBoundingClientRect();

          samples.push({ left: box.left, right: box.right, workspace: workspace.getBoundingClientRect().left });

          if (performance.now() - started < 450) {
            requestAnimationFrame(sample);
          } else {
            resolve();
          }
        };

        requestAnimationFrame(sample);
      });

      return samples;
    });

    expect(measurements.some((sample) => sample.left < -1 && sample.left > -389)).toBe(true);
    expect(measurements.every((sample) => Math.abs(sample.right - sample.workspace) < 1)).toBe(true);
    expect(Math.abs(measurements.at(-1)?.workspace ?? 100)).toBeLessThan(1);
    await page.getByRole('button', { name: 'Открыть дерево страниц' }).click();
    await page.getByRole('treeitem', { name: /Mobile draft/ }).waitFor();
    await context.close();
  });

});

import { chooseLocalSiteOrigin } from '../support/site-onboarding.js';
