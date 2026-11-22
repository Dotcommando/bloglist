import path from 'node:path';

import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';

import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { LIST_PAGES } from '../../src/infra/pages/pages.tokens.js';
import type { IListPages } from '../../src/ports/inbound/pages/list-pages.port.js';
import { account } from '../support/admin-users.js';
import { verifyCalibrationControls } from '../support/calibration-controls-browser.js';
import { calibrationHelperFixture } from '../support/calibration-helper-fixture.js';
import { forkHarness } from '../support/fork-harness.js';

it('calibrates live serving, restores, retains history after profile deletion and applies explicitly',
  async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser executable required');
    }

    const helper = await calibrationHelperFixture();
    const f = await forkHarness({
      admin: true,
      adminRoot: path.resolve('admin/dist'),
      delivery: HtmlDelivery.Static,
      ...helper,
    });

    helper.target(f.origin);
    const browser = await chromium.launch({ executablePath, headless: true });
    const site = f.sites[0]!;
    const ids = f.sites.map(site => site.siteId);
    let releaseSave = (): void => {};

    try {
      const initial = await f.supervisor.resources.read(ids);

      await f.supervisor.resources.change({
        expectedVersion: initial.version,
        databaseCpu: 1,
        sites: initial.sites.map(entry => ({ ...entry, processes: entry.siteId === site.siteId ? 2 : 1 })),
      });
      const context = await browser.newContext();
      const headers = { Origin: f.origin, 'X-Zarya-Admin': '1' };
      const login = await context.request.post(f.origin + '/api/admin/auth/login', {
        headers, data: { email: account().profile().email, password: 'synthetic fork password' },
      });

      expect(login.status()).toBe(200);
      const page = await context.newPage();
      const failures: string[] = [];

      page.on('pageerror', error => failures.push(error.message));
      await page.goto(f.origin + '/admin/sites/' + site.siteId + '/settings');
      await page.locator('.admin-language select').selectOption('en');
      await page.getByRole('button', { name: 'Calibration', exact: true }).click();
      const workspace = page.locator('._calibration-workspace:visible');

      await workspace.getByRole('button', { name: 'Create profile', exact: true }).click();
      expect(await workspace.getByRole('textbox', { name: 'Page 1', exact: true }).inputValue()).toBe('/');
      expect(await workspace.getByRole('spinbutton', { name: 'Page share 1', exact: true }).inputValue()).toBe('50');
      expect(await workspace.locator('[data-calibration-site]').count()).toBe(2);
      const primarySite = workspace.locator('[data-calibration-site="' + site.siteId + '"]');

      await primarySite.getByRole('button', { name: 'Add page', exact: true }).click();
      await verifyCalibrationControls(page, workspace);
      const secondShare = workspace.getByRole('spinbutton', { name: 'Page share 3', exact: true });
      const save = workspace.getByRole('button', { name: 'Save profile', exact: true });

      await secondShare.fill('51.25');
      await primarySite.getByRole('button', { name: 'Increase share by 1%', exact: true }).nth(1).click();
      expect(await secondShare.inputValue()).toBe('52.25');
      expect(await save.isEnabled()).toBe(false);
      expect(await workspace.locator('[data-calibration-total]').getAttribute('role')).toBe('alert');
      await workspace.getByRole('spinbutton', { name: 'Page share 1', exact: true }).fill('40');
      await workspace.getByRole('spinbutton', { name: 'Page share 2', exact: true }).fill('40');
      await secondShare.fill('20');
      expect(await save.isEnabled()).toBe(true);
      expect(await workspace.locator('[data-calibration-total]').getAttribute('role')).toBeNull();
      await workspace.getByRole('textbox', { name: 'Page 1', exact: true }).fill('/probe/');
      await workspace.getByRole('textbox', { name: 'Page 2', exact: true }).fill('/probe/');
      const secondary = (await f.local.get<IListPages>(LIST_PAGES).execute({ siteId: site.siteId }))
        .find(page => page.mark === 'Other');

      expect(secondary?.pageNumber).toBeTruthy();
      await workspace.getByRole('textbox', { name: 'Page 3', exact: true }).fill(secondary!.pageNumber!);
      await workspace.getByRole('spinbutton', { name: 'Total database and CMS CPU budget', exact: true }).fill('3');
      await workspace.locator('summary').click();
      await workspace.getByRole('textbox', { name: 'Pool size candidates, comma separated', exact: true }).fill('1, 5');
      await workspace.getByRole('spinbutton', { name: 'Database CPU step', exact: true }).fill('1');
      await workspace.getByRole('textbox', {
        name: 'Process count candidates, comma separated', exact: true,
      }).fill('1, 2');
      await workspace.getByRole('textbox', { name: 'Generator concurrency levels', exact: true }).fill('1');

      for (const name of ['Warmup, seconds', 'Probe, seconds', 'Confirmation, seconds']) {
        await workspace.getByRole('spinbutton', { name, exact: true }).fill('1');
      }
      await workspace.getByRole('spinbutton', { name: 'Total run budget, seconds', exact: true }).fill('90');
      const gate = new Promise<void>(resolve => {
        releaseSave = resolve;
      });

      await page.route('**/api/admin/installation/calibration/profiles', async route => {
        if (route.request().method() === 'POST') {
          await gate;
        }
        await route.continue();
      });
      await save.click();
      await expect.poll(() => workspace.locator('._calibration-overlay').isVisible()).toBe(true);
      releaseSave();
      await expect.poll(() => workspace.locator('form').getAttribute('aria-busy')).toBe('false');
      expect(await save.isEnabled()).toBe(true);
      await page.unrouteAll({ behavior: 'wait' });
      const starting = page.waitForResponse(response => response.request().method() === 'POST'
        && response.url().endsWith('/calibration/runs'));

      await workspace.getByRole('button', { name: 'Start calibration', exact: true }).click();
      expect((await starting).status()).toBe(202);
      await expect.poll(() => workspace.locator('._calibration-progress').textContent(), { timeout: 90000 })
        .toContain('Completed');
      const restored = await f.supervisor.resources.read(ids);

      expect(restored.sites).toEqual(initial.sites.map(entry => ({
        ...entry,
        processes: entry.siteId === site.siteId ? 2 : 1,
      })));
      expect(restored.databaseCpu).toBe(1);
      expect((await f.read(site.host)).status).toBe(200);
      expect((await f.read(f.sites[1]!.host)).status).toBe(200);
      const rows = await f.connection.collection('calibration_runs').find({}).toArray();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.snapshot.profile.targets[2].kind).toBe('PageNumber');
      expect(rows[0]?.snapshot.targets).toContainEqual(expect.objectContaining({
        authority: site.host, path: '/second/', effectiveShare: 20,
      }));
      expect(rows[0]?.snapshot.targets.map((target: { effectiveShare: number }) => target.effectiveShare).sort())
        .toEqual([20, 40, 40]);
      const runId = String(rows[0]?._id);
      const measurements = await f.connection.collection('calibration_measurements').find({ runId }).toArray();
      const winner = measurements.find(row => row._id === rows[0]?.snapshot.winnerId);

      expect(winner?.snapshot.kind).toBe('Confirmation');
      expect(winner?.snapshot.configuration.databaseCpu + winner?.snapshot.configuration.cmsCpu).toBe(3);
      expect(measurements.every(row => row.snapshot.observed.observedDatabaseCpu
        + row.snapshot.observed.observedCmsCpu === 3)).toBe(true);
      expect(winner?.snapshot.metrics.errors).toBe(0);
      expect(winner?.snapshot.metrics.requests).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'General', exact: true }).click();
      const resources = page.locator('.resource-settings:visible');

      await expect.poll(() => resources.locator('._resource-feedback').textContent())
        .toContain('Calibration result filled');
      await resources.getByRole('button', { name: 'Save allocation', exact: true }).click();
      await expect.poll(() => resources.locator('._resource-feedback').textContent(), { timeout: 30000 })
        .toContain('Allocation saved');
      await page.getByRole('button', { name: 'Calibration', exact: true }).click();
      await workspace.getByRole('button', { name: 'Delete profile', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect.poll(() => workspace.locator('form').count()).toBe(0);
      await page.getByRole('button', { name: 'Main', exact: true }).click();
      const history = page.locator('.settings-form ._calibration-history:visible');

      await expect.poll(() => history.getByRole('button', { name: 'Apply', exact: true }).count()).toBe(1);
      await history.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect.poll(() => history.locator('.cms-success').textContent()).toContain('result applied');
      const applied = await f.supervisor.resources.read(ids);

      expect(applied.sites.find(entry => entry.siteId === site.siteId)?.processes)
        .toBe(winner?.snapshot.configuration.sites
          .find((entry: { siteId: string }) => entry.siteId === site.siteId).processes);
      expect(applied.sites.find(entry => entry.siteId === f.sites[1]!.siteId)?.processes)
        .toBe(winner?.snapshot.configuration.sites
          .find((entry: { siteId: string }) => entry.siteId === f.sites[1]!.siteId).processes);
      expect(await f.connection.collection('calibration_profiles').countDocuments({ deletedAt: null })).toBe(0);
      expect(await f.connection.collection('calibration_runs').countDocuments({})).toBe(1);
      expect(failures).toEqual([]);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: '.tmp/calibration-history-mobile.png', fullPage: true });
    } finally {
      releaseSave();
      await browser.close();
      await f.close();
      await helper.close();
    }
  }, 150000);
