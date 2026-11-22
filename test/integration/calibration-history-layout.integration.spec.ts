import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Locator } from 'playwright-core';
import { expect, it } from 'vitest';

import { calibrationDefault } from '../../admin/src/features/calibration/calibration-profile.js';

async function verifyTextAction(summary: Locator): Promise<void> {
  await summary.page().mouse.move(0, 0);
  const style = await summary.evaluate(node => {
    const style = getComputedStyle(node);
    const expected = document.createElement('span');

    expected.style.color = style.getPropertyValue('--cms-accent');
    node.append(expected);
    const accent = getComputedStyle(expected).color;

    expected.remove();

    return {
      color: style.color,
      accent,
      decoration: style.textDecorationLine,
      pattern: style.textDecorationStyle,
      cursor: style.cursor,
    };
  });

  expect(style.color).toBe(style.accent);
  expect(style.decoration).toBe('underline');
  expect(style.pattern).toBe('dotted');
  expect(style.cursor).toBe('pointer');
  await summary.hover();
  expect(await summary.evaluate(node => getComputedStyle(node).textDecorationLine)).toBe('none');
  await summary.page().mouse.move(0, 0);
  await summary.focus();
  await summary.press('Enter');
  expect(await summary.evaluate(node => node.parentElement!.hasAttribute('open'))).toBe(true);
  await summary.press('Space');
  expect(await summary.evaluate(node => node.parentElement!.hasAttribute('open'))).toBe(false);
  await summary.press('Enter');
}

it('shows compact scenario metrics and themed calibration statuses in both languages', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const site = {
    siteId: 'site-1',
    name: 'Synthetic catalog',
    primaryDomain: 'example.test',
    mark: 'Site',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };
  const date = '2026-11-17T12:00:00.000Z';
  const metrics = {
    requests: 108,
    errors: 0,
    averageMs: 100,
    medianMs: 90,
    p95Ms: 381.2,
    p99Ms: 438.3,
    dropped: 0,
    successfulRps: 10,
  };
  const runs = ['Running', 'Completed', 'Cancelled', 'Failed', 'Interrupted', 'RestorationRequired'].map(status => ({
    runId: status,
    profile: {
      ...calibrationDefault([site.siteId], 2),
      profileId: status,
      name: 'Profile ' + status,
      version: 'v1',
      createdAt: date,
      updatedAt: date,
    },
    startedAt: date,
    finishedAt: status === 'Running' ? null : date,
    status,
    phase: 'Probe',
    restored: true,
    winnerId: null,
    referenceId: null,
    error: null,
    generatorPlacement: 'Synthetic generator',
    addonSnapshots: [{ siteId: site.siteId, addons: [] }],
  }));
  const measurement = {
    measurementId: 'm1',
    kind: 'Probe',
    configuration: { databaseCpu: 1, cmsCpu: 1, sitePoolSize: 5, sites: [{ siteId: site.siteId, processes: 1 }] },
    metrics,
    siteMetrics: { [site.siteId]: metrics },
    stepMetrics: { [JSON.stringify([site.siteId, '/'])]: metrics },
    concurrency: 1,
    passed: true,
    startedAt: date,
    finishedAt: date,
  };
  const errors: string[] = [];

  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.route('**/*', async route => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname.startsWith('/api/')) {
        expect(route.request().method()).toBe('GET');
        let json: unknown = { items: [] };

        if (pathname.endsWith('/auth/me')) {
          json = {};
        } else if (pathname === '/api/admin/sites') {
          json = { items: [site] };
        } else if (pathname === '/api/admin/sites/site-1') {
          json = site;
        } else if (pathname === '/api/admin/installation/settings') {
          json = { adminOrigin: 'https://admin.example.test', version: 'v1' };
        } else if (pathname.includes('/calibration/runs')) {
          const run = runs.find(run => pathname.endsWith('/' + run.runId));

          json = run ? { run, measurements: [measurement] } : runs;
        } else if (pathname.endsWith('/installation/resources')) {
          json = {
            version: 'v1',
            capacity: 2,
            infrastructureCpu: 0,
            databaseCpu: 1,
            cmsCpu: 1,
            cmsCpuBudget: 1,
            databasePlacement: 'ManagedLocal',
            observedDatabaseCpu: 1,
            observedCmsCpu: 1,
            recommendation: 1,
            unallocated: 0,
            managed: true,
            running: { [site.siteId]: 1 },
            processErrors: { [site.siteId]: null },
            databaseVersion: null,
            databaseImage: null,
            applyError: null,
            sites: [{ siteId: site.siteId, processes: 1 }],
            siteDetails: [{ ...site, domain: site.primaryDomain, dumpMode: 'InProcess', addons: [] }],
          };
        } else if (pathname.endsWith('/settings')) {
          json = {
            siteId: site.siteId,
            timeZone: 'UTC',
            addresses: { publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3000', originMode: 'Local' },
          };
        } else if (pathname.endsWith('/publication')) {
          json = { templates: [], pageAvailability: [] };
        } else if (pathname.endsWith('/hooks')) {
          json = { hooks: [], handlers: [] };
        } else if (pathname.endsWith('/files')) {
          json = { version: 'v1', pending: false, files: [], folders: [] };
        }

        await route.fulfill({ json });

        return;
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';

      await route.fulfill({
        body: await readFile(path.resolve('admin/dist', asset)),
        contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });
    await page.goto('http://localhost:31989/admin/sites/site-1/settings');
    const history = page.locator('._calibration-history:visible');

    await history.getByText('Profile Completed', { exact: true }).waitFor({ timeout: 5000 });

    for (const language of ['en', 'ru']) {
      await page.locator('.admin-language select').selectOption(language);

      for (const run of runs) {
        const row = history.locator('tr').filter({ has: page.getByText(run.profile.name, { exact: true }) });
        const status = row.locator('.cms-status');

        await status.waitFor({ timeout: 2000 });
        const color = run.status === 'Running' ? '--cms-warning'
          : run.status === 'Completed' ? '--cms-accent' : '--cms-danger';

        expect(await status.evaluate((node, token) => {
          const style = getComputedStyle(node);
          const expected = document.createElement('span');

          expected.style.color = style.getPropertyValue(token);
          node.append(expected);
          const matches = style.color === getComputedStyle(expected).color;

          expected.remove();

          return matches;
        }, color)).toBe(true);
      }

      await history.locator('tr').filter({ has: page.getByText('Profile Completed', { exact: true }) })
        .getByRole('button', { name: language === 'ru' ? 'Подробности' : 'Details', exact: true }).click();
      const scenarios = history.locator('details').filter({
        has: page.getByText(
          language === 'ru' ? 'Запросы сценариев' : 'Scenario requests', { exact: true },
        ),
      });

      await verifyTextAction(scenarios.locator('summary'));
      const table = scenarios.getByRole('table');

      expect(await table.getByRole('row').count()).toBe(2);
      expect(await table.getByRole('cell').allTextContents()).toEqual([
        language === 'ru' ? 'Запросов: 108' : 'Requests: 108',
        language === 'ru' ? 'Ошибок: 0' : 'Errors: 0',
        'p95: 381.2 ms',
        'p99: 438.3 ms',
      ]);

      const sites = history.locator('._calibration-detail details').filter({
        has: page.getByText(language === 'ru' ? 'По сайтам' : 'By site', { exact: true }),
      });

      await verifyTextAction(sites.locator('summary'));
      const siteTable = sites.getByRole('table');

      expect(await sites.textContent()).toContain('10.0 visits/s');
      expect(await siteTable.getByRole('row').count()).toBe(2);
      expect(await siteTable.getByRole('cell').allTextContents()).toEqual([
        language === 'ru' ? 'Среднее: 100.0 ms' : 'Mean: 100.0 ms',
        language === 'ru' ? 'Медиана: 90.0 ms' : 'Median: 90.0 ms',
        'p95: 381.2 ms',
        'p99: 438.3 ms',
      ]);

      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const cells = await table.locator('td').evaluateAll(nodes => nodes.map(node => {
          const bounds = node.getBoundingClientRect();

          return { x: bounds.x, y: bounds.y, width: bounds.width, padding: getComputedStyle(node).paddingTop };
        }));

        expect(cells[0]!.y).toBe(cells[1]!.y);
        expect(cells[2]!.y).toBe(cells[3]!.y);
        expect(cells[2]!.y).toBeGreaterThan(cells[0]!.y);
        expect(cells[1]!.x).toBeGreaterThanOrEqual(cells[0]!.x + cells[0]!.width);
        expect(cells.every(cell => cell.padding === '0px')).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await history.getByRole('button', { name: language === 'ru' ? 'Скрыть' : 'Hide', exact: true }).click();
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60000);
