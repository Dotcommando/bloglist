import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';

import { packAddonArchive } from '../../src/adapters/outbound/runtime/addons/addon-package-archive.js';
import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON } from '../../src/infra/addons/addons.tokens.js';
import type { IEnableSiteAddon } from '../../src/ports/inbound/addons/enable-site-addon.port.js';
import { account } from '../support/admin-users.js';
import { calibrationHelperFixture } from '../support/calibration-helper-fixture.js';
import { forkHarness } from '../support/fork-harness.js';

it('calibrates Events API visits alongside Bloglist, retains per-site versions and displays all forks', async () => {
  const events = process.env.ZARYA_TEST_EVENTS_ADDON_DIRECTORY;
  const eventsBase = process.env.ZARYA_TEST_EVENTS_BASE_DIRECTORY;
  const bloglist = process.env.ZARYA_TEST_BLOGLIST_ADDON_DIRECTORY;
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!events || !eventsBase || !bloglist || !executablePath) {
    throw new Error('Explicit Events/Bloglist packages and browser executable required');
  }

  const helper = await calibrationHelperFixture();
  let fixture: Awaited<ReturnType<typeof forkHarness>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  async function cleanup(): Promise<void> {
    const stopped = await Promise.allSettled([browser?.close(), fixture?.close()]);
    const results = [...stopped, ...await Promise.allSettled([helper.close()])];
    const failures = results.filter(result => result.status === 'rejected');

    if (failures.length) {
      throw new AggregateError(failures.map(result => result.reason), 'Calibration cleanup failed');
    }
  }

  try {
    const f = await forkHarness({
      admin: true,
      delivery: HtmlDelivery.Static,
      adminRoot: path.resolve('admin/dist'),
      runtimePackages: [eventsBase, bloglist],
      ...helper,
      prepare: async (local, sites) => {
        const packages = local.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);

        for (const [index, addonKey] of [[0, 'events'], [1, 'bloglist']] as const) {
          const registration = packages.registrations().find(row => row.definition.addonKey === addonKey);

          if (!registration?.defaultConfiguration) {
            throw new Error('Package configuration missing');
          }
          await local.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
            siteId: sites[index]!.siteId,
            addonKey,
            actorId: 'test',
            expectedVersion: null,
            configuration: registration.defaultConfiguration(),
          });
        }
      },
    });

    fixture = f;
    helper.target(f.origin);
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const headers = { Origin: f.origin, 'X-Zarya-Admin': '1' };
    const login = await context.request.post(f.origin + '/api/admin/auth/login', {
      headers, data: { email: account().profile().email, password: 'synthetic fork password' },
    });

    expect(login.status()).toBe(200);
    const archive = path.join(f.root, 'events.runtime.gz');

    await packAddonArchive(events, archive);
    const cookies = (await context.cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    const uploaded = await fetch(f.origin + '/api/admin/addon-updates', {
      method: 'POST',
      headers: {
        ...headers,
        Cookie: cookies,
        'Content-Type': 'application/gzip',
        'Content-Length': String((await stat(archive)).size),
      },
      body: await openAsBlob(archive, { type: 'application/gzip' }),
    });

    expect(uploaded.status).toBe(200);
    const proposal = await uploaded.json();

    expect(proposal).toMatchObject({ fromVersion: '0.4.3', toVersion: '0.4.4', mode: 'Compatible' });
    let finished = false;
    const applying = context.request.post(f.origin + '/api/admin/addon-updates/' + proposal.updateId + '/apply', {
      headers,
    }).finally(() => {
      finished = true;
    });
    const observed = Promise.allSettled([applying]);

    try {
      while (!finished) {
        for (const site of f.sites) {
          expect((await f.read(site.host)).status).toBe(200);
        }
        await new Promise<void>(resolve => setTimeout(resolve, 25));
      }
      const applied = await applying;

      expect(applied.status()).toBe(200);
      expect(await applied.json()).toMatchObject({ phase: 'Completed', paused: false, forcedProcessCount: 0 });
    } finally {
      await observed;
    }
    const resources = await context.request.get(f.origin + '/api/admin/installation/resources', { headers });

    expect(resources.status()).toBe(200);
    const state = await resources.json();

    expect(state.processes).toHaveLength(4);
    expect(new Set(state.processes.map((row: { pid: number }) => row.pid)).size).toBe(4);
    expect(state.processes.filter((row: { role: string }) => row.role === 'Administration')).toHaveLength(1);
    expect(state.processes.filter((row: { role: string }) => row.role === 'Coordinator')).toHaveLength(1);
    const one = f.sites[0]!;
    const two = f.sites[1]!;
    const root = f.origin + '/api/admin/installation/calibration';
    const draft = {
      name: 'Events and Bloglist calibration',
      scope: 'Installation',
      siteId: null,
      distributedCpu: 3,
      targets: [
        {
          siteId: one.siteId,
          kind: 'RelativeUrl',
          reference: '/probe/',
          share: 6000,
          apiSteps: [{ addonKey: 'events', queryId: 'sessions' }],
        },
        { siteId: two.siteId, kind: 'RelativeUrl', reference: '/probe/', share: 4000 },
      ],
      criteria: { averageMs: null, medianMs: null, p95Ms: 10000, p99Ms: null },
      search: {
        concurrencyLevels: [1],
        processCounts: [1],
        poolSizes: [5],
        databaseCpuStep: 1,
        warmupSeconds: 1,
        probeSeconds: 1,
        confirmationSeconds: 1,
        maximumSeconds: 60,
      },
    };
    const created = await context.request.post(root + '/profiles', { headers, data: draft });

    expect(created.status()).toBe(201);
    const profile = await created.json();
    const page = await context.newPage();
    const exceptions: string[] = [];

    page.on('pageerror', error => exceptions.push(error.message));
    await page.goto(f.origin + '/admin/sites/' + one.siteId + '/settings');
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.getByText('Total CMS processes:', { exact: false }).waitFor();
    expect(await page.getByText('Administration and background work', { exact: true }).count()).toBe(1);
    await page.screenshot({ path: '.tmp/addon-resources-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByText('Total CMS processes:', { exact: false }).scrollIntoViewIfNeeded();
    const pidCells = page.getByRole('table', { name: 'CMS processes', exact: true }).locator('[data-label="PID"]');

    for (const cell of await pidCells.all()) {
      expect(await cell.evaluate(node => {
        const range = document.createRange();

        range.selectNodeContents(node.querySelector('span') ?? node);

        return range.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1;
      })).toBe(true);
    }
    await page.screenshot({ path: '.tmp/addon-resources-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Calibration', exact: true }).click();
    await page.getByRole('button', { name: draft.name, exact: true }).click();
    await expect.poll(() => page.locator('._api-step select').count()).toBe(1);
    expect(await page.locator('._api-step select').inputValue()).toBe('events:sessions');
    await page.getByRole('button', { name: '+ Public API', exact: true }).click();
    expect(await page.locator('._api-step select').count()).toBe(2);
    await page.getByRole('button', { name: 'Remove step', exact: true }).last().click();
    expect(await page.locator('._api-step select').count()).toBe(1);
    await page.screenshot({ path: '.tmp/addon-calibration-profile.png', fullPage: true });

    const started = await context.request.post(root + '/runs', {
      headers, data: { profileId: profile.profileId, expectedVersion: profile.version },
    });

    expect(started.status()).toBe(202);
    const initial = await started.json();

    expect(initial.addonSnapshots).toContainEqual({
      siteId: one.siteId,
      addons: [expect.objectContaining({
        addonKey: 'events', implementationVersion: '0.4.4',
      })],
    });
    expect(initial.addonSnapshots).toContainEqual({
      siteId: two.siteId,
      addons: [expect.objectContaining({
        addonKey: 'bloglist', implementationVersion: '0.1.0', queries: [],
      })],
    });
    await expect.poll(async () => {
      expect((await f.read(one.host)).status).toBe(200);
      expect((await f.read(two.host)).status).toBe(200);
      const reply = await context.request.get(root + '/runs/' + initial.runId, { headers });
      const detail = await reply.json();

      if (detail.run.status === 'Failed') {
        throw new Error(detail.run.error);
      }

      return detail.run.status;
    }, { timeout: 90000, interval: 500 }).toBe('Completed');
    const detailResponse = await context.request.get(root + '/runs/' + initial.runId, { headers });
    const detail = await detailResponse.json();

    expect(detail.run.restored).toBe(true);
    const winner = detail.measurements.find((row: { measurementId: string }) =>
      row.measurementId === detail.run.winnerId);

    expect(winner.metrics.errors).toBe(0);
    expect(Object.entries(winner.stepMetrics).some(([key, value]) => key.includes('/api/sessions?')
      && typeof value === 'object' && value !== null && 'requests' in value && Number(value.requests) > 0)).toBe(true);
    expect(detail.run.addonSnapshots).toEqual(initial.addonSnapshots);
    const retained = await f.connection.collection('calibration_runs').findOne({ _id: initial.runId });

    expect(retained?.snapshot.addonSnapshots).toEqual(initial.addonSnapshots);
    await page.getByRole('button', { name: 'Main', exact: true }).click();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByText('Add-ons during measurement', { exact: true }).waitFor();
    expect(await page.getByText('events 0.4.4', { exact: true }).count()).toBe(1);
    expect(await page.getByText('bloglist 0.1.0', { exact: true }).count()).toBe(1);
    await page.screenshot({ path: '.tmp/addon-calibration-history.png', fullPage: true });
    const changed = await context.request.post(root + '/profiles', {
      headers,
      data: {
        ...draft,
        name: 'Foreign query must fail',
        targets: draft.targets.map(target => ({
          ...target, apiSteps: [{ addonKey: 'events', queryId: 'sessions' }],
        })),
      },
    });
    const invalid = await changed.json();
    const rejected = await context.request.post(root + '/runs', {
      headers,
      data: {
        profileId: invalid.profileId, expectedVersion: invalid.version,
      },
    });

    expect(rejected.status()).toBe(400);
    expect(exceptions).toEqual([]);
  } finally {
    await cleanup();
  }
}, 180000);
