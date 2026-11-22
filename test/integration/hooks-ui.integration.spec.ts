import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { verifyScrollShadow } from '../support/admin-scroll.js';

describe('Hooks drawer and editor', () => {
  it('preserves a collapsed tree and separate draft/apply actions', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 600 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    const site = {
      siteId: 'site-1',
      mark: 'Site',
      name: 'Test site',
      primaryDomain: 'example.test',
      languages: ['en'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    const handler = {
      handlerId: 'handler-1',
      title: 'First handler',
      kind: 'Event',
      enabled: true,
      activeVersionId: 'applied-1',
      version: 'v1',
      draft: { source: 'return { commands: [] };', capabilities: [] },
    };
    const binding = {
      subscriptionId: 'binding-1',
      title: handler.title,
      handlerId: handler.handlerId,
      hookKey: 'cms.page.created',
      kind: 'Event',
      schemaVersion: 1,
      version: 'binding-v1',
      enabled: true,
      priority: 0,
      retrySafe: false,
      addonKey: null,
      handlerKey: null,
      ownerKind: 'User',
      configuration: {},
      filters: {},
      deliveryMode: 'Event',
      manifestKey: null,
    };
    const writes: string[] = [];

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;

      if (url.origin !== 'http://localhost:31989') {
        await route.abort();

        return;
      }
      if (pathname === '/api/admin/auth/me') {
        await route.fulfill({ json: { user: { authorization: { systemAdmin: true, siteAdminSiteIds: [] } } } });

        return;
      }
      if (pathname === '/api/admin/sites') {
        await route.fulfill({ json: { items: [site] } });

        return;
      }
      if (pathname === '/api/admin/sites/site-1') {
        await route.fulfill({ json: site });

        return;
      }
      if (pathname.endsWith('/pages') || pathname.endsWith('/addons') || pathname.endsWith('/addon-installations')) {
        await route.fulfill({ json: { items: [] } });

        return;
      }
      if (pathname.endsWith('/settings')) {
        await route.fulfill({ json: { timeZone: 'UTC' } });

        return;
      }
      if (pathname.endsWith('/publication')) {
        await route.fulfill({ json: { templates: [], pageAvailability: [] } });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/hooks') {
        await route.fulfill({
          json: {
            handlers: [handler],
            hooks: Array.from({ length: 40 }, (_, index) => ({
              hookKey: index ? 'cms.test.event-' + index : 'cms.page.created',
              title: 'Hook ' + index,
              description: 'Confirmed test event',
              provider: 'cms',
              kind: 'Event',
              scopeKind: 'Site',
              registeredAt: '2026-10-29T10:00:00Z',
              available: true,
              subscriptions: index ? [] : [binding],
            })),
          },
        });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/hooks/history') {
        await route.fulfill({ json: { items: [] } });

        return;
      }
      if (pathname.startsWith('/api/admin/sites/site-1/hooks/handlers/handler-1')) {
        if (route.request().method() === 'POST') {
          writes.push(pathname);
          const body: Record<string, unknown> = route.request().postDataJSON();

          if (pathname.endsWith('/draft')) {
            Object.assign(handler, { title: body.title, draft: body.draft, version: 'v2' });
          }
          if (pathname.endsWith('/apply')) {
            handler.activeVersionId = 'applied-2';
            handler.version = 'v3';
          }
        }
        await route.fulfill({ json: handler });

        return;
      }
      if (pathname.startsWith('/api/')) {
        throw new Error('Unexpected fixture route: ' + pathname);
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe asset path');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript'
          : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });

    try {
      await page.goto('http://localhost:31989/admin/sites/site-1/hooks');
      const drawer = page.getByRole('complementary', { name: 'Hooks', exact: true });

      await drawer.getByRole('button', { name: 'Expand cms.page.created', exact: true }).waitFor();
      expect(await drawer.getByRole('button', { name: /First handler/ }).count()).toBe(0);
      await drawer.getByRole('button', { name: 'Expand cms.page.created', exact: true }).click();
      expect(new URL(page.url()).pathname).toBe('/admin/sites/site-1/hooks');
      await drawer.getByRole('button', { name: 'cms.page.created 1', exact: true }).click();
      await page.getByRole('heading', { name: 'cms.page.created', exact: true }).waitFor();
      expect(await page.getByText('CMS Zarya', { exact: true }).count()).toBe(1);
      const historyButton = page.getByRole('button', { name: 'History', exact: true });
      const toolbar = page.locator('main[aria-label="Hooks workspace"] > ._workspace-toolbar');
      const historyBox = await historyButton.boundingBox();
      const toolbarBox = await toolbar.boundingBox();

      expect(toolbarBox!.x + toolbarBox!.width - historyBox!.x - historyBox!.width).toBe(40);
      expect(await drawer.getByRole('button', { name: 'Refresh', exact: true }).locator('svg').count()).toBe(1);
      await historyButton.click();
      await page.getByRole('heading', { name: 'Latest 200 deliveries' }).waitFor();
      await page.getByRole('button', { name: 'Back to hook', exact: true }).click();
      await page.getByRole('heading', { name: 'cms.page.created', exact: true }).waitFor();
      await drawer.getByRole('button', { name: /First handler/ }).click();
      await historyButton.click();
      await page.getByRole('heading', { name: 'Latest 200 deliveries' }).waitFor();
      await page.getByRole('button', { name: 'Back to hook', exact: true }).click();
      await page.getByRole('heading', { name: 'First handler', exact: true }).waitFor();
      await page.getByLabel('Server TypeScript', { exact: true }).fill('return { commands: [], note: "draft" };');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Draft saved' }).waitFor();
      expect(handler.activeVersionId).toBe('applied-1');
      expect(writes).toEqual(['/api/admin/sites/site-1/hooks/handlers/handler-1/draft']);
      expect(await drawer.getByRole('button', {
        name: 'Collapse cms.page.created',
        exact: true,
      }).getAttribute('aria-expanded')).toBe('true');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await page.getByText('applied-2', { exact: false }).waitFor();
      await verifyScrollShadow(drawer.locator('._tree-scroll'), drawer.locator('._drawer-heading'));
      const before = await drawer.locator('._tree-scroll').evaluate((element) => element.scrollTop);

      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      expect(await drawer.locator('._tree-scroll').evaluate((element) => element.scrollTop)).toBe(before);
      await page.setViewportSize({ width: 320, height: 700 });
      await page.getByRole('button', { name: 'Open hooks tree', exact: true }).click();
      expect(await drawer.getAttribute('aria-hidden')).toBe('false');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
