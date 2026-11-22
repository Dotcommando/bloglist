import type { Page } from 'playwright-core';
import { expect } from 'vitest';

import type { IInstallationResourceView } from '../../src/domain/resources/installation-resources.js';

export async function verifyResourceSaveFeedback(page: Page): Promise<void> {
  const resources = page.locator('.resource-settings:visible');
  const first = resources.locator('._resource-site input').first();
  const save = resources.locator('button.cms-primary');
  const overlay = resources.locator('._resource-saving-overlay');
  const spinner = resources.locator('._saving-spinner');
  const actual = resources.locator('._resource-site ._resource-actual').first();
  const endpoint = '**/api/admin/installation/resources';
  let release!: (continueRequest: boolean) => void;
  const held = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  let handled = Promise.resolve();
  let submitted = false;

  await page.setViewportSize({ width: 1440, height: 640 });
  await page.route(endpoint, (route) => {
    if (route.request().method() !== 'POST') {
      return route.continue();
    }
    submitted = true;
    handled = held.then((continueRequest) => continueRequest ? route.continue() : route.abort());

    return handled;
  });

  try {
    await first.fill('2');
    await save.click();
    await expect.poll(() => submitted).toBe(true);
    await overlay.waitFor();
    expect(await spinner.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const pane = element.closest('._workspace-scroll')!.getBoundingClientRect();
      const form = element.closest('form')!.getBoundingClientRect();
      const top = Math.max(0, pane.top, form.top);
      const bottom = Math.min(pane.bottom, form.bottom, innerHeight);
      const message = element.parentElement!.getBoundingClientRect();

      return bounds.top >= top && bounds.bottom <= bottom
        && Math.abs((message.top + message.bottom) / 2 - (top + bottom) / 2) < 3;
    })).toBe(true);
    await page.screenshot({ path: '.tmp/resource-loader-scrolled.png' });
    release(true);
    await expect.poll(() => overlay.count(), { timeout: 30000 }).toBe(0);
    expect(await save.textContent()).toContain('Allocation saved');
    expect(await save.isEnabled()).toBe(false);
    expect(await save.getAttribute('title')).toBe('No unsaved changes');
    await first.fill('3');
    expect(await save.isEnabled()).toBe(true);
    expect(await save.textContent()).toContain('Save allocation');
  } finally {
    release(false);
    await handled;
    await page.unroute(endpoint);
  }

  await resources.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await expect.poll(() => first.inputValue()).toBe('2');
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  const response = await page.request.get(new URL('/api/admin/installation/resources', page.url()).href, {
    headers: { 'X-Zarya-Admin': '1', Origin: new URL(page.url()).origin },
  });
  const state = await response.json();
  const firstId = state.sites[0].siteId;

  await page.route(endpoint, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          ...state,
          version: 'synthetic-fast-save',
          sites: state.sites.map((entry: { siteId: string; processes: number }) => ({
            ...entry, processes: entry.siteId === firstId ? 1 : entry.processes,
          })),
          running: { ...state.running, [firstId]: 1 },
          siteDetails: state.siteDetails.map((entry: IInstallationResourceView['siteDetails'][number]) => ({
            ...entry, dumpMode: 'InProcess',
          })),
        },
      });
    } else {
      await route.continue();
    }
  });

  try {
    await first.fill('1');
    await save.click();
    await expect.poll(() => actual.textContent()).toContain('Site: assigned 1');
    expect(await overlay.isVisible()).toBe(true);
    await page.clock.runFor(399);
    expect(await overlay.isVisible()).toBe(true);
    await page.clock.runFor(2);
    await expect.poll(() => overlay.count()).toBe(0);
    expect(await save.textContent()).toContain('Allocation saved');
    expect(await save.isEnabled()).toBe(false);
    expect(await resources.locator('._dump-explanation').textContent())
      .toContain('Settings → Dumps → Create dump');
  } finally {
    await page.unroute(endpoint);
    await page.clock.resume();
  }
  await resources.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await expect.poll(() => first.inputValue()).toBe('2');
  await first.fill('1');
  await save.click();
  await expect.poll(() => overlay.count(), { timeout: 15000 }).toBe(0);
  await expect.poll(() => actual.textContent()).toContain('Site: assigned 1');
}
