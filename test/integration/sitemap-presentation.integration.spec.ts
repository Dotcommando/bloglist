import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright-core';

import { artifactText } from '../../src/adapters/outbound/publication/files/crawler-artifacts.js';
import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import type { IBuiltPublication } from '../../src/ports/outbound/publication/frontend-build.port.js';
import { source } from '../support/publication.js';
import { urlFixture } from '../support/routing.js';

describe('public sitemap presentation', () => {
  it('styles real XML without XSLT, wraps long escaped URLs and displays an empty map', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const base = source('unused');
    const snapshot = { ...base, publicOrigin: 'https://sitemap.test' };
    const build = async (paths: string[]): Promise<IBuiltPublication> => {
      const urls = paths.map((path, index) => urlFixture({
        urlId: 'url-' + index, pageId: 'page-' + index, path,
      }).toState());
      const pages = paths.map((_, index) => ({
        ...base.pages[0]!, pageId: 'page-' + index, robotsIndex: true,
      }));

      return new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
        releaseId: 'styled',
        assetBasePath: '/assets/releases/styled/',
        snapshot: { ...snapshot, pages, urls },
        documents: pages.map((page) => ({
          pageId: page.pageId, html: '<html><head></head><body></body></html>', frontendSourceIds: [],
        })),
        requestPlans: [],
      });
    };
    let built = await build(['/', '/a&b/' + 'long-path-'.repeat(30)]);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage();
      const failures: string[] = [];

      page.setDefaultTimeout(5000);

      page.on('pageerror', (error) => failures.push(error.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const filePath = url.pathname === '/sitemap.xml' ? 'sitemap.xml'
          : url.pathname.replace('/assets/releases/styled/', 'assets/');
        const file = url.origin === 'https://sitemap.test'
          ? built.artifacts.find((file) => file.path === filePath && file.public) : null;

        if (!file) {
          await route.abort();

          return;
        }
        await route.fulfill({ contentType: file.mimeType, body: await artifactText(file) });
      });
      await page.goto('https://sitemap.test/sitemap.xml');
      await page.waitForFunction(() => getComputedStyle(document.documentElement, '::before')
        .content.includes('XML Sitemap'));
      expect(await page.locator('loc').first().textContent()).toBe('https://sitemap.test/');
      expect(await page.locator('loc').nth(1).textContent()).toContain('/a&b/');

      for (const width of [320, 390, 576, 768, 992, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('url').first().evaluate((element) => getComputedStyle(element).display)).toBe('grid');
      }
      await mkdir('.tmp', { recursive: true });
      await page.screenshot({ path: '.tmp/sitemap-public-desktop.png' });
      await page.setViewportSize({ width: 390, height: 900 });
      await page.screenshot({ path: '.tmp/sitemap-public-mobile.png' });
      built = await build([]);
      await page.reload();
      await page.waitForFunction(() => getComputedStyle(document.documentElement, '::before')
        .content.includes('XML Sitemap'));
      expect(await page.locator('loc').count()).toBe(0);
      expect(failures).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
