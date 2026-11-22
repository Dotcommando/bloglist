import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { createConnection } from 'mongoose';
import { chromium } from 'playwright-core';
import { expect, it, vi } from 'vitest';

import { MongooseAdminUserStore } from
  '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { ScryptAdminPasswordAdapter } from
  '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createProcessSupervisor } from '../../src/infra/resources/process-supervisor.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { account } from '../support/admin-users.js';
import { verifyResourceSaveFeedback } from '../support/resource-save-feedback-browser.js';
import { verifyResourceRequestRaces } from '../support/resource-settings-request-races.js';
import { siteInput } from '../support/sites.js';

it.each([1, 2, 6])('applies resource settings from the admin on %i CPUs without restarting the coordinator',
  async (capacity) => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!mongoUri || !executablePath) {
      throw new Error('Explicit isolated MongoDB and browser executable required');
    }
    await mkdir('.tmp', { recursive: true });
    const root = await mkdtemp(path.resolve('.tmp/database-pool-'));
    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const settings = {
      mongoUri,
      database,
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
      dumpsRoot: path.join(root, 'coordination'),
      host: '127.0.0.1',
      port: 0,
    };
    const connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();

    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      await connection.close();
      throw new Error('Refusing to use a non-test database');
    }

    let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
    let supervisor: Awaited<ReturnType<typeof createProcessSupervisor>> | undefined;
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      await applyMigrations(connection, 'migrations');
      local = await createLocalApplication({
        ...settings, operator: { operatorId: 'test', platformAdministrator: true }, rendering: settings,
      });
      const site = await local.get<ICreateSite>(CREATE_SITE).execute({
        ...siteInput(), primaryDomain: 'pool.test',
      });

      if (capacity === 6) {
        await local.get<ICreateSite>(CREATE_SITE).execute({
          ...siteInput(), mark: 'Other', primaryDomain: 'other.test',
        });
      }
      await local.close();
      local = undefined;
      const password = 'synthetic pool password';
      const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

      await new MongooseAdminUserStore(connection).run(async (work) => {
        await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
      });
      const listener = createServer();

      await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
      const address = listener.address();

      if (!address || typeof address === 'string') {
        throw new Error('Missing reserved listener');
      }
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      const origin = `http://127.0.0.1:${address.port}`;

      supervisor = await createProcessSupervisor({
        ...settings, port: address.port, adminAuth: { origin }, adminRoot: path.resolve('admin/dist'),
      }, { capacity, infrastructureCpu: 0, databasePlacement: DatabasePlacement.ManagedLocal });
      const initialPid = supervisor.pool.select(site.siteId).child.pid;
      const context = await browser.newContext();
      const login = await context.request.post(origin + '/api/admin/auth/login', {
        data: { email: account().profile().email, password },
        headers: { Origin: origin, 'X-Zarya-Admin': '1' },
      });

      expect(login.status()).toBe(200);
      const page = await context.newPage();
      const pageErrors: string[] = [];

      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.clock.install();
      await page.goto(origin + '/admin/sites/' + site.siteId + '/settings');
      await page.locator('.admin-language select').selectOption('en');
      await page.getByRole('button', { name: 'General', exact: true }).click();
      const resources = page.locator('.resource-settings:visible');
      const pool = resources.locator('[data-site-pool-size]');

      await pool.waitFor();
      expect(await pool.isEnabled()).toBe(true);
      expect(await resources.locator('._resource-site input').first().isEnabled()).toBe(capacity > 2);
      await pool.fill('3');
      await resources.getByRole('button', { name: 'Save allocation', exact: true }).click();
      await expect.poll(() => resources.locator('._resource-feedback').textContent(), { timeout: 30000 })
        .toContain('Allocation saved');
      const applied = await supervisor.resources.read([site.siteId]);

      expect(applied.databasePools).toMatchObject({ sitePoolSize: 3, appliedSitePoolSize: 3, coordinatorPoolSize: 5 });
      expect(supervisor.pool.running(site.siteId)).toBe(1);
      expect(supervisor.pool.select(site.siteId).child.pid).not.toBe(initialPid);
      expect((await context.request.get(origin + '/api/health')).status()).toBe(200);

      if (capacity === 6) {
        await verifyResourceSaveFeedback(page);
        await verifyResourceRequestRaces(page, 'pool.test');
        const row = resources.locator('._resource-site').filter({ hasText: 'pool.test' });
        const input = row.locator('input');
        const save = resources.getByRole('button', { name: 'Save allocation', exact: true });
        const failedResize = vi.spyOn(supervisor.pool, 'resize')
          .mockRejectedValueOnce(new Error('synthetic worker initialization failure'));

        try {
          await input.fill('2');
          await save.click();
          await expect.poll(() => resources.locator('._resource-saving-overlay').isVisible()).toBe(true);
          await expect.poll(() => resources.locator('form').getAttribute('aria-busy')).toBe('false');
          await expect.poll(() => resources.locator('._resource-feedback').textContent())
            .toContain('not fully applied');
          expect(await row.locator('._resource-actual').textContent()).toContain('Site: assigned 2');
          expect(await row.locator('._resource-actual').textContent()).toContain('running now 1');
          expect(await save.isEnabled()).toBe(true);
        } finally {
          failedResize.mockRestore();
        }
        await save.click();
        await expect.poll(() => row.locator('._resource-actual').textContent(), { timeout: 15000 })
          .toContain('running now 2');
        await expect.poll(() => resources.locator('form').getAttribute('aria-busy')).toBe('false');
      }
      await page.setViewportSize({ width: 375, height: 850 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await resources.locator('._database-pools').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.tmp/database-pool-${capacity}-cpu.png`, fullPage: true });
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await supervisor?.close();
      await local?.close();

      await connection.dropDatabase();
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
