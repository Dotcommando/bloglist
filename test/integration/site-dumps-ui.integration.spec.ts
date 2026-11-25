import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright-core';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { verifyScrollShadow } from '../support/admin-scroll.js';
import { account } from '../support/admin-users.js';
import { siteInput } from '../support/sites.js';

describe('site dump administration in the production browser bundle', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const password = 'synthetic dump UI password';
  let connection: Connection;
  let app: INestApplication<Server>;
  let browser: Browser;
  let root: string;
  let origin: string;
  let siteId: string;

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!mongoUri || !executablePath) {
      throw new Error('Explicit test MongoDB and browser required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/dumps-ui-'));
    const storage = {
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
      dumpsRoot: path.join(root, 'dumps'),
      media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
    };
    const local = await createLocalApplication({
      mongoUri,
      database,
      rendering: storage,
      dumpsRoot: storage.dumpsRoot,
      media: storage.media,
      operator: { operatorId: 'test', platformAdministrator: true },
    });

    try {
      siteId = (await local.get<ICreateSite>(CREATE_SITE).execute(siteInput())).siteId;

      for (const name of ['UI Header', 'UI Footer']) {
        await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
          siteId,
          name,
          kind: TemplateSourceKind.Chunk,
          html: '<p>' + name + '</p>',
          css: '',
          browserTypeScript: null,
          parameters: [],
        });
      }
    } finally {
      await local.close();
    }
    const users = new MongooseAdminUserStore(connection);
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await users.run(async (store) => {
      await store.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
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
      ...storage,
      host: '127.0.0.1',
      port: address.port,
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
          throw new Error('Unsafe test DB');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function open(): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const response = await context.request.post(origin + '/api/admin/auth/login', {
      headers: { Origin: origin, 'X-Zarya-Admin': '1' }, data: { email: 'user-1@example.test', password },
    });

    expect(response.status()).toBe(200);
    const page = await context.newPage();
    const diagnostics: string[] = [];

    page.on('pageerror', (error) => {
      diagnostics.push(error.message);
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        diagnostics.push(response.status() + ' ' + response.url());
      }
    });

    page.setDefaultTimeout(5000);

    await page.goto(origin + '/admin/sites/' + siteId + '/settings');
    await page.locator('.admin-language select').selectOption('en');

    try {
      await page.getByRole('button', { name: 'General', exact: true }).waitFor();
    } catch (error) {
      throw new Error(String(error) + '\n' + await page.locator('body').innerText() + '\n' + diagnostics.join('\n'));
    }

    return { context, page };
  }

  it('creates, downloads, imports and restores through real authenticated HTTP', async () => {
    const { context, page } = await open();
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    try {
      await page.getByRole('button', { name: 'Dumps', exact: true }).click();
      await page.getByText('No dumps yet.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Create dump', exact: true }).click();
      const link = page.locator('table a').first();

      await link.waitFor();
      expect(await page.locator('table').textContent()).toContain('KiB');
      const downloading = page.waitForEvent('download');

      await link.click();
      const download = await downloading;
      const temporary = await download.path();

      if (!temporary) {
        throw new Error('Missing download');
      }

      const bytes = await readFile(temporary);

      expect(bytes[0]).toBe(31);
      expect(bytes[1]).toBe(139);
      await page.getByLabel('Upload a dump from your computer').setInputFiles({
        name: download.suggestedFilename(), mimeType: 'application/gzip', buffer: bytes,
      });
      await page.getByRole('button', { name: 'Upload dump', exact: true }).click();
      await page.getByText('Dump uploaded and verified. Choose Restore in the table.', { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 2);
      expect(await page.locator('table tbody tr').count()).toBe(2);
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await page.locator('table tbody tr').first().getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByRole('button', { name: 'General', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Dumps', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 2);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('fits the shared viewport matrix, preserves general inputs and shadows the fixed toolbar', async () => {
    const { context, page } = await open();

    try {
      const publicOrigin = page.locator('#site-public-origin');

      await publicOrigin.fill('https://unsaved.example.test');
      await page.getByRole('button', { name: 'Dumps', exact: true }).click();
      await page.getByRole('heading', { name: 'Site dumps', exact: true }).waitFor();

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 520 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const panels = page.locator('.site-dumps > ._dump-transfers > form._dump-panel');

        expect(await panels.count()).toBe(2);
        const boxes = await panels.evaluateAll((nodes) => nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);

          return {
            x: box.x,
            y: box.y,
            right: box.right,
            bottom: box.bottom,
            background: style.backgroundColor,
            border: style.borderTopWidth,
          };
        }));

        expect(boxes.every((box) => box.background !== 'rgba(0, 0, 0, 0)' && box.background !== 'rgb(255, 255, 255)'
          && box.border === '0px')).toBe(true);

        if (width >= 992) {
          expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
          expect(boxes[1]!.x - boxes[0]!.right).toBeGreaterThanOrEqual(16);
        } else {
          expect(Math.abs(boxes[0]!.x - boxes[1]!.x)).toBeLessThan(1);
          expect(boxes[1]!.y - boxes[0]!.bottom).toBeGreaterThanOrEqual(16);
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: path.resolve('.tmp/dumps-layout-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.resolve('.tmp/dumps-layout-mobile.png') });
      await page.setViewportSize({ width: 1440, height: 520 });
      const pane = page.locator('.settings-workspace');
      const toolbar = page.locator('main:has(> .settings-workspace) > ._workspace-toolbar');

      await verifyScrollShadow(pane, toolbar);
      await page.getByRole('button', { name: 'General', exact: true }).click();
      expect(await publicOrigin.inputValue()).toBe('https://unsaved.example.test');
      await page.locator('.admin-language select').selectOption('ru');
      await page.getByRole('button', { name: 'Дампы', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Дампы сайта', exact: true }).waitFor();
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('protects dumps against unauthenticated access and cross-origin commands', async () => {
    const context = await browser.newContext();

    try {
      expect((await context.request.get(origin + '/api/admin/sites/' + siteId + '/dumps')).status()).toBe(401);
      expect((await context.request.post(origin + '/api/admin/sites/' + siteId + '/dumps/create', {
        headers: { Origin: 'https://foreign.example.test', 'X-Zarya-Admin': '1' }, data: {},
      })).status()).toBe(403);
    } finally {
      await context.close();
    }
  });

  it('exports one checked category, offers checked import and deletes its archive', async () => {
    const { context, page } = await open();

    try {
      await page.getByRole('button', { name: 'Dumps', exact: true }).click();
      await page.getByLabel('Dump type', { exact: true }).selectOption('Chunks');
      const exported = page.getByRole('table', { name: 'Export items', exact: true });

      await exported.getByText('UI Header', { exact: true }).click();
      const checkbox = exported.getByRole('checkbox', { name: 'UI Header', exact: true });

      expect(await checkbox.isChecked()).toBe(true);
      await checkbox.focus();
      await page.keyboard.press('Space');
      expect(await checkbox.isChecked()).toBe(false);
      await page.keyboard.press('Space');
      expect(await checkbox.isChecked()).toBe(true);
      expect(await exported.getByRole('checkbox', { name: 'UI Footer', exact: true }).isChecked()).toBe(false);
      await page.getByRole('button', { name: 'Create dump', exact: true }).click();
      const table = page.getByRole('table', { name: 'Existing dumps', exact: true });
      const row = table.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Chunks', exact: true }) });

      await row.waitFor();
      const filename = await row.getByRole('link').innerText();

      await row.getByRole('button', { name: 'Select for import', exact: true }).click();
      const imported = page.getByRole('table', { name: 'Import items', exact: true });

      await imported.waitFor();
      expect(await imported.getByRole('checkbox').count()).toBe(1);
      expect(await imported.getByRole('checkbox').isChecked()).toBe(false);
      await imported.getByRole('checkbox', { name: 'UI Header', exact: true }).check();
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await page.getByRole('button', { name: 'Import selected', exact: true }).click();
      await page.getByRole('button', { name: 'General', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Dumps', exact: true }).click();
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await page.getByRole('button', { name: 'Delete dump ' + filename, exact: true }).click();
      await page.getByRole('link', { name: filename, exact: true }).waitFor({ state: 'detached' });
      expect(await connection.db!.collection('rendering_elements')
        .countDocuments({ siteId, name: 'UI Footer' })).toBe(1);
    } finally {
      await context.close();
    }
  });
});
