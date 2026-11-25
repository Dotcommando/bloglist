import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, type BrowserContext, chromium, type Locator, type Page } from 'playwright-core';
import sharp from 'sharp';

import { paginationParameters, paginationSnippetSource } from '../../src/domain/rendering/pagination-snippet.js';
import { verifyScrollShadow } from '../support/admin-scroll.js';

interface IRenderingUiFixture {
  context: BrowserContext;
  page: Page;
  errors: string[];
  records: Map<string, Record<string, unknown>>;
  state: {
    status: number;
    pendingBackup: boolean;
    publicationStatus: number;
    publicationDiagnostic: Record<string, unknown> | null;
    publicationPath: string | null;
    pageSaveStatus: number;
  };
  writes: { path: string; body: Record<string, unknown> }[];
}

async function clickDraft(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Save draft', exact: true });

  if (await button.count() === 0) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
  }
  await button.click();
}

describe('built responsive rendering editors with deterministic HTTP fixtures', () => {
  let browser: Browser;

  beforeAll(async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }
    browser = await chromium.launch({ executablePath, headless: true });
  });
  afterAll(async () => {
    await browser?.close();
  });

  async function fixture(deviceScaleFactor = 1): Promise<IRenderingUiFixture> {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
      deviceScaleFactor,
    });
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(4000);
    const site = {
      siteId: 'site-1',
      mark: 'Demo',
      name: 'Example site',
      primaryDomain: 'example.test',
      languages: ['en', 'ru'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    const workingPage = {
      siteId: 'site-1',
      pageId: 'page-1',
      mark: 'Home',
      title: 'Home',
      language: 'en',
      contentMd: 'Content',
      status: 'DRAFT',
    };
    const makeElement = (key: string, kind: string): Record<string, unknown> => ({
      siteId: 'site-1',
      elementId: 'id-' + key,
      key,
      name: key,
      kind,
      version: 'v1',
      backupState: 'Ready',
      html: '<section>' + key + '</section>',
      css: 'section{color:red}',
      browserTypeScript: null,
      parameters: [],
      usages: [{ kind: 'Page', id: 'page-1', title: 'Home', readable: true }],
    });
    const records = new Map<string, Record<string, unknown>>([
      ['templates/Home', makeElement('Home', 'Template')], ['chunks/Footer', makeElement('Footer', 'Chunk')],
      ['snippets/Pagination', {
        ...makeElement('Pagination', 'Snippet'),
        html: '',
        css: '',
        parameters: paginationParameters,
        snippet: paginationSnippetSource,
      }],
    ]);
    const state: IRenderingUiFixture['state'] = {
      status: 200,
      pendingBackup: false,
      publicationStatus: 200,
      publicationDiagnostic: null,
      publicationPath: '/',
      pageSaveStatus: 200,
    };
    const writes: { path: string;body: Record<string, unknown> }[] = [];

    await page.route('**/*', async(route) => {
      const request = route.request();
      const url = new URL(request.url());
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
      if (['/api/admin/sites/site-1/addons', '/api/admin/sites/site-1/addon-installations'].includes(pathname)) {
        await route.fulfill({ json: { items: [] } });

        return;
      }
      if (['/api/admin/installation/calibration/runs', '/api/admin/installation/resources'].includes(pathname)) {
        await route.fulfill({ status: 503, json: { error: 'Unavailable' } });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/settings') {
        await route.fulfill({ json: { siteId: 'site-1', addresses: {}, timeZone: 'UTC' } });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/pages') {
        if (request.method() === 'POST') {
          writes.push({ path: pathname, body: request.postDataJSON() });
          Object.assign(workingPage, request.postDataJSON());
          await route.fulfill({ status: 201, json: workingPage });

          return;
        }
        await route.fulfill({ json: { items: [workingPage] } });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/pages/page-1') {
        if (request.method() === 'POST') {
          writes.push({ path: pathname, body: request.postDataJSON() });

          if (state.pageSaveStatus !== 200) {
            await route.fulfill({ status: state.pageSaveStatus, json: { error: 'InternalError' } });

            return;
          }
          Object.assign(workingPage, request.postDataJSON());
        }
        await route.fulfill({ json: workingPage });

        return;
      }
      if (pathname.endsWith('/publication')) {
        await route.fulfill({
          json: {
            templates: [{ templateId: 'Home', requiresParameters: false }],
            pageAvailability: [{
              pageId: workingPage.pageId,
              assignedPath: state.publicationPath,
              publicPath: state.publicationPath,
            }],
            templateId: 'Home',
            path: state.publicationPath,
          },
        });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/publish') {
        writes.push({ path: pathname, body: request.postDataJSON() });
        await route.fulfill({
          status: state.publicationStatus,
          json: state.publicationStatus === 200 ? { siteId: 'site-1', releaseId: 'release' }
            : state.publicationDiagnostic ? { error: 'Validation', diagnostic: state.publicationDiagnostic }
              : { error: 'Conflict' },
        });

        return;
      }

      const match = /^\/api\/admin\/sites\/site-1\/(templates|chunks|snippets)(?:\/([A-Za-z0-9_]+))?(\/preview)?$/.exec(pathname);

      if (match) {
        const section = match[1]!;
        const id = match[2];

        if (request.method() === 'GET') {
          const elements = [...records.entries()].filter(([key]) => key.startsWith(section + '/'))
            .map(([,value]) => value);

          await route.fulfill({ json: id ? records.get(section + '/' + id) : { items: elements } });
        } else {
          const body: Record<string, unknown> = request.postDataJSON();

          writes.push({ path: pathname, body });

          if (state.status !== 200) {
            await route.fulfill({ status: state.status, json: { error: 'Conflict' } });

            return;
          }
          if (match[3]) {
            const previewId = 'a'.repeat(48);

            await route.fulfill({ json: { previewId, url: '/api/admin/rendering-previews/' + previewId } });

            return;
          }

          const key = id ?? String(1n + [...records.keys()]
            .filter((entry) => entry.startsWith(section + '/') && /^[1-9][0-9]*$/.test(entry.split('/')[1]!))
            .map((entry) => BigInt(entry.split('/')[1]!)).reduce((a, b) => a > b ? a : b, 0n));
          const saved = {
            ...(records.get(section + '/' + key) ?? makeElement(key, section === 'templates' ? 'Template' : 'Chunk')),
            ...body,
            version: 'v' + (writes.length + 1),
            backupState: state.pendingBackup ? 'Pending' : 'Ready',
          };

          records.set(section + '/' + key, saved);
          await route.fulfill({ status: id ? 200 : 201, json: saved });
        }

        return;
      }
      if (pathname.startsWith('/api/admin/rendering-previews/')) {
        await route.fulfill({ body: '<html><body>Compiled preview</body></html>', contentType: 'text/html' });

        return;
      }
      if (pathname.endsWith('/template-variables')) {
        await route.fulfill({ json: { siteId: 'site-1', version: 'v1', fields: [] } });

        return;
      }
      if (pathname === '/api/admin/sites/site-1/files') {
        await route.fulfill({ json: { version: 'v1', pending: false, files: [], folders: [] } });

        return;
      }
      if (pathname.startsWith('/api/')) {
        throw new Error('Unexpected fixture API: ' + pathname);
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture asset');
      }

      const contentType = asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html';

      await route.fulfill({ body: await readFile(filename), contentType });
    });

    return { context, page, records, state, writes, errors };
  }

  it('uses a compact mobile shell with one-line site identity and aligned drawer controls', async () => {
    const f = await fixture();
    const siteName = 'A very long site name '.repeat(12);
    const site = {
      siteId: 'site-1',
      mark: 'Demo',
      name: siteName,
      primaryDomain: 'example.test',
      languages: ['en', 'ru'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };

    try {
      await f.page.route('**/api/admin/sites', (route) => route.fulfill({ json: { items: [site] } }));
      await f.page.route('**/api/admin/sites/site-1/settings', (route) => route.fulfill({
        json: {
          siteId: 'site-1',
          timeZone: 'UTC',
          addresses: { originMode: 'Local', publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3000' },
        },
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('a._current-site').waitFor();

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991]) {
          await f.page.setViewportSize({ width, height: 1000 });
          const select = await f.page.locator('.admin-language select').boundingBox();
          const signOut = await f.page.locator('._header-preferences .cms-action-square').boundingBox();

          expect(select!.height).toBe(36);
          expect(signOut!.height).toBe(36);
          expect(signOut!.width).toBe(36);
          const brand = await f.page.locator('._cms-brand').boundingBox();
          const link = await f.page.locator('a._current-site').boundingBox();
          const icon = await f.page.locator('._site-external-icon').boundingBox();

          expect(link!.y + link!.height / 2).toBeCloseTo(brand!.y + brand!.height / 2, 0);
          expect(icon!.x + icon!.width).toBeLessThanOrEqual(link!.x + link!.width + 1);
          expect(await f.page.locator('a._current-site').getAttribute('title')).toBe(siteName);
          expect(await f.page.locator('a._current-site').getAttribute('target')).toBe('_blank');
          const truncated = await f.page.locator('._current-site-name').evaluate((element) =>
            element.scrollWidth > element.clientWidth && getComputedStyle(element).textOverflow === 'ellipsis');

          expect(truncated).toBe(true);

          const editorButton = f.page.locator('#page-workspace .cms-circle');
          const editor = (await editorButton.boundingBox())!;

          expect(editor.height).toBe(36);
          expect(editor.width).toBe(36);
          expect((await f.page.locator('._page-title-row').boundingBox())!.height).toBe(36);
          await editorButton.click();
          const drawerButton = f.page.locator('#page-drawer ._drawer-context .cms-circle');
          const drawer = (await drawerButton.boundingBox())!;

          expect(drawer.y).toBeCloseTo(editor.y, 0);
          expect(drawer.height).toBe(36);
          expect((await f.page.locator('#page-drawer .cms-square').boundingBox())!.height).toBe(36);
          await drawerButton.click();
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
      }

      await f.page.setViewportSize({ width: 390, height: 1000 });
      await f.page.screenshot({ path: '.tmp/admin-mobile-page.png' });

      for (const section of ['templates/Home', 'files']) {
        await f.page.setViewportSize({ width: 390, height: 1000 });
        await f.page.goto('http://localhost:31989/admin/sites/site-1/' + section);

        if (section === 'files') {
          await f.page.getByRole('button', { name: 'assets/images', exact: true }).click();
        } else {
          await f.page.locator('#element-Template-name').waitFor();
        }

        const main = f.page.locator('main.page-workspace').filter({ visible: true });
        const button = main.locator('.cms-circle').first();
        const editor = (await button.boundingBox())!;

        expect(editor.height).toBe(36);
        expect((await main.locator('._workspace-toolbar').boundingBox())!.height).toBeLessThanOrEqual(52);
        await button.click();
        const drawer = f.page.locator('aside.page-drawer').filter({ visible: true });
        const forward = drawer.locator('._drawer-context .cms-circle');
        const box = (await forward.boundingBox())!;

        expect(box.y).toBeCloseTo(editor.y, 0);
        await forward.click();
      }
      await f.page.screenshot({ path: '.tmp/admin-mobile-shell.png' });

      for (const width of [992, 1199, 1200, 1440]) {
        await f.page.setViewportSize({ width, height: 1000 });
        expect((await f.page.locator('.admin-language select').boundingBox())!.height).toBe(40);
        expect((await f.page.locator('._header-preferences .cms-action-square').boundingBox())!.height).toBe(44);
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each(['reduce', 'no-preference'])('keeps mobile input and caret still when comparison appears with %s motion',
    async (motion) => {
      const f = await fixture();
      const published = {
        siteId: 'site-1',
        pageId: 'page-1',
        mark: 'Home',
        title: 'Home',
        language: 'en',
        contentMd: 'Content',
        status: 'PUBLISHED',
        rendering: { templateId: 'Home', delivery: 'Static', interaction: 'None', parameters: {}, loaders: [] },
      };

      try {
        await f.page.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
        await f.page.route('**/api/admin/sites/site-1/pages/page-1', (route) => route.fulfill({ json: published }));
        await f.page.route('**/publication', (route) => route.fulfill({
          json: {
            templateId: 'Home',
            path: '/',
            templates: [{ templateId: 'Home', requiresParameters: false }],
            pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
            editorial: {
              releaseId: 'active',
              publishedPage: route.request().url().includes('/pages/') ? published : null,
              robotsHasUnpublishedChanges: false,
              pages: [{ pageId: 'page-1', hasPublishedVersion: true, changedFields: [] }],
            },
          },
        }));
        await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
        await f.page.getByText('Matches the version on the site', { exact: true }).waitFor();
        const pane = f.page.locator('._page-editor-scroll');
        const controls = f.page.locator('.page-editor-controls');
        const title = f.page.locator('#page-title');

        for (const language of ['en', 'ru']) {
          await f.page.locator('.admin-language select').selectOption(language);
          const show = language === 'en' ? 'Show published version' : 'Показать опубликованное';

          for (const width of [320, 375, 390, 576, 768, 991]) {
            for (const height of [650, 1000]) {
              await f.page.setViewportSize({ width, height });
              await f.page.evaluate(async () => {
                await Promise.all(document.getAnimations()
                  .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
                  .map((animation) => animation.finished));
              });
              const header = (await controls.boundingBox())!;
              const heading = (await f.page.locator('._page-title-row').boundingBox())!;
              const actions = (await f.page.locator('.page-actions').boundingBox())!;

              expect(header.height).toBeLessThanOrEqual(101);
              expect(await controls.getByRole('button', { name: show, exact: true }).count()).toBe(0);

              if (width < 768) {
                expect(actions.y - heading.y - heading.height).toBe(12);
                expect(actions.x).toBe(heading.x);
                expect(actions.width).toBe(heading.width);
              }
              await title.focus();
              await title.evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 2));
              const before = (await title.boundingBox())!;

              await f.page.keyboard.insertText('x');
              const compare = pane.getByRole('button', { name: show, exact: true });

              await compare.waitFor();
              await f.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
              expect((await title.boundingBox())!.y).toBeCloseTo(before.y, 0);
              expect(await title.evaluate((element: HTMLInputElement) => ({
                focused: document.activeElement === element, start: element.selectionStart, end: element.selectionEnd,
              }))).toEqual({ focused: true, start: 3, end: 3 });
              expect(await title.inputValue()).toBe('Hoxme');
              expect(await controls.boundingBox()).toEqual(header);
              const gap = await compare.evaluate((element) => element.getBoundingClientRect().top
                - element.closest('._page-status-primary')!.querySelector('small')!.getBoundingClientRect().bottom);

              expect(gap).toBe(8);
              await f.page.keyboard.press('Backspace');
              await compare.waitFor({ state: 'hidden' });
              await f.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
              expect((await title.boundingBox())!.y).toBeCloseTo(before.y, 0);
              expect(await title.inputValue()).toBe('Home');
              expect(await title.evaluate((element: HTMLInputElement) => ({
                focused: document.activeElement === element, start: element.selectionStart,
              }))).toEqual({ focused: true, start: 2 });
            }
          }
        }
        await f.page.setViewportSize({ width: 375, height: 1200 });
        await f.page.getByRole('tab', { name: 'SEO', exact: false }).click();
        const description = f.page.locator('#page-meta-description');

        await description.focus();
        const before = (await description.boundingBox())!;

        await f.page.keyboard.insertText('x');
        await pane.getByRole('button', { name: 'Показать опубликованное', exact: true }).waitFor();
        expect((await description.boundingBox())!.y).toBeCloseTo(before.y, 0);
        expect(await description.evaluate((element: HTMLTextAreaElement) => ({
          focused: document.activeElement === element, start: element.selectionStart,
        }))).toEqual({ focused: true, start: 1 });
        await f.page.keyboard.press('Backspace');
        expect((await description.boundingBox())!.y).toBeCloseTo(before.y, 0);

        if (motion === 'reduce') {
          await f.page.setViewportSize({ width: 375, height: 862 });
          await f.page.locator('._editor-tabs').getByRole('tab').first().click();
          await pane.evaluate((element) => element.scrollTop = 0);
          await f.page.screenshot({ path: '.tmp/mobile-comparison-clean.png' });
          await title.fill('Home changed');
          await f.page.locator('#page-editor-title').click();
          await pane.evaluate((element) => element.scrollTop = 0);
          await f.page.screenshot({ path: '.tmp/mobile-comparison-changed.png' });
        }
        expect(f.writes).toEqual([]);
        expect(f.errors).toEqual([]);
      } finally {
        await f.context.close();
      }
    });

  it.each(['reduce', 'no-preference'])('centers heading and keeps controls stable with %s motion', async (motion) => {
    const f = await fixture();
    const published = {
      siteId: 'site-1',
      pageId: 'page-1',
      mark: 'Home',
      title: 'Home',
      language: 'en',
      contentMd: 'Content',
      status: 'PUBLISHED',
      rendering: {
        templateId: 'Home', delivery: 'Static', interaction: 'None', parameters: {}, loaders: [],
      },
    };

    try {
      await f.page.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
      await f.page.route('**/api/admin/sites/site-1/pages/page-1', (route) => route.fulfill({ json: published }));
      await f.page.route('**/publication', (route) => route.fulfill({
        json: {
          templateId: 'Home',
          path: '/',
          templates: [{ templateId: 'Home', requiresParameters: false }],
          pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
          editorial: {
            releaseId: 'active',
            publishedPage: route.request().url().includes('/pages/') ? published : null,
            robotsHasUnpublishedChanges: false,
            pages: [{
              pageId: 'page-1', hasPublishedVersion: true, changedFields: [],
            }],
          },
        },
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.getByText('Matches the version on the site', { exact: true }).waitFor();
      const heading = f.page.locator('._page-title-row');
      const actions = f.page.locator('.page-actions');
      const controls = f.page.locator('.page-editor-controls');
      const pane = f.page.locator('._page-editor-scroll');
      const fieldGap = (): Promise<number> => f.page.evaluate(() => {
        const title = document.querySelector('#page-title')!.getBoundingClientRect();
        const template = document.querySelector('#page-template')!.getBoundingClientRect();

        return template.top - title.bottom;
      });
      const settle = (): Promise<void> => f.page.evaluate(async () => {
        await Promise.all(document.getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished));
      });

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 576, 768, 992, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 1000 });
          await settle();
          const before = {
            title: (await heading.boundingBox())!,
            actions: await actions.boundingBox(),
            controls: await controls.boundingBox(),
            pane: await pane.boundingBox(),
          };

          if (width >= 768) {
            expect(before.title.y + before.title.height / 2)
              .toBeCloseTo(before.actions!.y + before.actions!.height / 2, 0);
            expect(before.title.x + before.title.width).toBeLessThanOrEqual(before.actions!.x);
          }

          const spacing = await f.page.locator('._page-status-area').evaluate((element) => {
            const pane = element.closest('._page-editor-scroll')!;
            const tabs = pane.querySelector('._editor-tabs')!;

            return {
              above: element.getBoundingClientRect().top - pane.getBoundingClientRect().top,
              below: tabs.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
            };
          });

          expect(spacing.above).toBeCloseTo(spacing.below, 0);
          const gapBefore = await fieldGap();

          await f.page.locator('#page-title').fill('Changed title');
          await f.page.getByRole('button', {
            name: language === 'en' ? 'Show published version' : 'Показать опубликованное', exact: true,
          }).waitFor();
          await settle();
          expect(await f.page.locator('._editorial-field-hint').count()).toBe(0);
          expect(await f.page.locator('#page-title').locator('..').getAttribute('class'))
            .toContain('_editorial-unsaved');
          expect(await fieldGap()).toBeCloseTo(gapBefore, 0);
          expect((await heading.boundingBox())!.y).toBeCloseTo(before.title.y - (width < 992 ? 0 : 21), 0);
          expect(await actions.boundingBox()).toEqual(before.actions);
          expect(await controls.boundingBox()).toEqual(before.controls);
          expect(await pane.boundingBox()).toEqual(before.pane);
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

          if (motion === 'reduce') {
            expect(await heading.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
          }
          await f.page.locator('#page-title').fill(published.title);
          await settle();
          expect(await heading.boundingBox()).toEqual(before.title);
          expect(await f.page.locator('._published-toggle-slot button').count()).toBe(0);
        }
      }
      expect(f.writes).toEqual([]);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each([1, 2])('compares drafts and restores unsaved text through a readonly form at DPR %i', async (dpr) => {
    const f = await fixture(dpr);
    const rendering = { templateId: 'Home', delivery: 'Static', interaction: 'None', parameters: {}, loaders: [] };
    const original = {
      siteId: 'site-1',
      pageId: 'page-1',
      mark: 'Home',
      title: 'A long published title '.repeat(12),
      language: 'en',
      contentMd: 'Published content',
      status: 'PUBLISHED',
      sortOrder: 100,
      parentPageId: null,
      h1: 'Public H1',
      metaTitle: 'Public SEO',
      metaDescription: null,
      robotsIndex: true,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogType: null,
      tvValues: {
        note: 'Public TV',
        photo: { kind: 'Image', mode: 'Single', key: 'w1200', fileId: 'photo', alt: 'Public alt' },
        attachment: { kind: 'File', fileId: 'document', label: 'Public guide' },
      },
      rendering,
    };
    const draft = { ...original, metaTitle: 'Draft SEO', tvValues: { ...original.tvValues, note: 'Draft TV' } };
    let releaseId = 'active';
    let publicPage = { ...original };

    try {
      const image = {
        fileId: 'photo',
        folderId: null,
        name: 'card.webp',
        mode: 'Responsive',
        hasVariants: true,
        mimeType: 'image/webp',
        byteSize: 100,
        originalDimensions: { width: 1200, height: 600, aspectRatio: 2 },
        outputs: [320, 1200].map((width) => ({
          key: 'w' + width,
          url: '/assets/images/card-' + width + '.webp',
          mimeType: 'image/webp',
          dimensions: { width, height: width / 2, aspectRatio: 2 },
        })),
      };
      const documentFile = {
        fileId: 'document',
        folderId: null,
        name: 'guide.pdf',
        mode: 'Original',
        hasVariants: false,
        mimeType: 'application/pdf',
        byteSize: 100,
        originalDimensions: null,
        outputs: [{ key: 'file', url: '/assets/files/guide.pdf', mimeType: 'application/pdf', dimensions: null }],
      };

      await f.page.route('**/api/admin/sites/site-1/files', (route) => route.fulfill({
        json: { version: '1', pending: false, folders: [], files: [image, documentFile] },
      }));
      await f.page.route('**/files/photo/content?*', (route) => route.fulfill({
        contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"/>',
      }));
      await f.page.route('**/api/admin/sites/site-1/pages', (route) => route.fulfill({ json: { items: [draft] } }));
      await f.page.route('**/api/admin/sites/site-1/pages/page-1', (route) => route.fulfill({ json: draft }));
      await f.page.route('**/api/admin/sites/site-1/template-variables', (route) => route.fulfill({
        json: {
          siteId: 'site-1',
          version: '1',
          fields: ['note', 'photo', 'attachment'].map((name) => ({
            name,
            caption: name,
            description: '',
            kind: name === 'note' ? 'Text' : name === 'photo' ? 'Image' : 'File',
            required: false,
            sortOrder: 100,
            templateIds: ['Home'],
          })),
        },
      }));
      await f.page.route('**/publication', (route) => route.fulfill({
        json: {
          templateId: 'Home',
          path: '/',
          templates: [{ templateId: 'Home', requiresParameters: false }],
          pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
          editorial: {
            releaseId,
            pages: [{
              pageId: 'page-1',
              hasPublishedVersion: true,
              changedFields: ['metaTitle', 'tvValues.note'],
            }],
            robotsHasUnpublishedChanges: false,
            publishedPage: route.request().url().includes('/pages/') ? publicPage : null,
          },
        },
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('#page-title').waitFor().catch(async () => {
        throw new Error(JSON.stringify({ errors: f.errors, body: await f.page.locator('body').innerText() }));
      });
      expect(f.errors).toEqual([]);
      await f.page.getByRole('button', { name: 'Show published version', exact: true }).waitFor();
      expect(await f.page.locator('.page-tree ._draft-marker').count()).toBe(1);
      await f.page.locator('#page-title').fill('Unsaved title');
      await f.page.getByRole('tab', { name: 'SEO', exact: false }).click();
      await f.page.locator('#page-meta-description').fill('Unsaved SEO text');
      const geometry = await f.page.locator('.page-editor-controls').boundingBox();

      await f.page.getByRole('button', { name: 'Show published version', exact: true }).click();
      await f.page.getByRole('button', { name: 'Return to editing', exact: true }).waitFor();
      expect(await f.page.locator('#page-title').inputValue()).toBe(original.title);
      expect(await f.page.locator('#page-meta-title').inputValue()).toBe('Public SEO');
      expect(await f.page.locator('#page-meta-description').inputValue()).toBe('');
      expect(await f.page.locator('#page-meta-title').getAttribute('readonly')).not.toBeNull();
      expect(await f.page.locator('.page-editor form').locator('input:disabled, textarea:disabled, select:disabled')
        .evaluateAll((els) => els.map((el) => el.id))).toEqual([]);
      expect(await f.page.locator('#page-robots').inputValue()).toBe('Allow indexing');
      expect(await f.page.locator('#page-robots').getAttribute('readonly')).not.toBeNull();
      await f.page.getByRole('tab', { name: 'Template variables', exact: false }).click();
      expect(await f.page.locator('#page-tv-note').inputValue()).toBe('Public TV');
      expect(await f.page.locator('#page-tv-note').evaluate((element) => getComputedStyle(element).borderTopColor))
        .toBe('rgb(156, 116, 31)');
      expect(await f.page.locator('._editorial-field-hint').count()).toBe(0);
      expect(await f.page.locator('#page-tv-note').getAttribute('readonly')).not.toBeNull();
      expect(await f.page.getByRole('textbox', { name: 'photo', exact: true })
        .getAttribute('aria-readonly')).toBe('true');
      expect(await f.page.locator('.media-size-choice ._media-size-chip').count()).toBe(1);
      expect(await f.page.locator('._media-file-clear').count()).toBe(0);
      await f.page.getByRole('textbox', { name: 'photo', exact: true }).click();
      expect(await f.page.getByRole('dialog').count()).toBe(0);
      expect(await f.page.locator('#page-tv-attachment').inputValue()).toContain('guide.pdf');
      expect(await f.page.locator('#page-tv-photo-alt').getAttribute('readonly')).not.toBeNull();
      releaseId = 'new-active';
      publicPage = { ...original, contentMd: 'New active content' };
      await f.page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await f.page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('#page-content')?.value
        === 'New active content');
      await f.page.getByRole('button', { name: 'Return to editing', exact: true }).click();
      expect(await f.page.locator('#page-title').inputValue()).toBe('Unsaved title');
      expect(await f.page.locator('#page-meta-description').inputValue()).toBe('Unsaved SEO text');
      expect(await f.page.getByRole('tab', { name: 'SEO', exact: false }).getAttribute('aria-selected')).toBe('true');
      expect(await f.page.locator('.page-editor-controls').boundingBox()).toEqual(geometry);
      expect(f.writes).toEqual([]);
      expect(f.errors).toEqual([]);

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);
        const show = language === 'en' ? 'Show published version' : 'Показать опубликованное';
        const back = language === 'en' ? 'Return to editing' : 'Вернуться к редактированию';

        for (const width of [320, 576, 768, 992, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 900 });
          const before = await f.page.locator('.page-editor-controls').boundingBox();

          await f.page.getByRole('button', { name: show, exact: true }).click();
          await f.page.getByRole('button', { name: back, exact: true }).waitFor();
          expect(await f.page.locator('.page-editor-controls').boundingBox()).toEqual(before);
          expect(await f.page.locator('._page-title-row').evaluate((el) => el.getBoundingClientRect().height))
            .toBe(width < 992 ? 36 : 32);

          for (const height of await f.page.locator('.page-actions > .cms-compact:visible').evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().height))) {
            expect(height).toBe(36);
          }
          expect(await f.page.locator('._page-status-area').evaluate((el) =>
            getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width >= 768 ? 2 : 1);
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

          if (dpr === 1 && language === 'ru' && [320, 1440].includes(width)) {
            await f.page.screenshot({ path: '.tmp/cms-0121-editor-' + width + '.png' });
          }
          expect(await f.page.locator('.cms-header .cms-action-square').evaluate((el) =>
            el.getBoundingClientRect().height)).toBe(width < 992 ? 36 : 44);
          await f.page.getByRole('button', { name: back, exact: true }).click();
        }
      }
    } finally {
      await f.context.close();
    }
  });

  it('refreshes the saved draft marker immediately without reopening the site', async () => {
    const f = await fixture();
    const published = {
      siteId: 'site-1',
      pageId: 'page-1',
      mark: 'Home',
      title: 'Home',
      language: 'en',
      contentMd: 'Content',
      status: 'PUBLISHED',
      rendering: {
        templateId: 'Home', delivery: 'Static', interaction: 'None', parameters: {}, loaders: [],
      },
    };
    let draft = { ...published };

    try {
      await f.page.route('**/api/admin/sites/site-1/pages/page-1', async (route) => {
        if (route.request().method() === 'POST') {
          Object.assign(draft, route.request().postDataJSON());
        }
        await route.fulfill({ json: draft });
      });
      await f.page.route('**/publication', (route) => route.fulfill({
        json: {
          templateId: 'Home',
          path: '/',
          templates: [{ templateId: 'Home', requiresParameters: false }],
          pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
          editorial: {
            releaseId: 'active',
            publishedPage: route.request().url().includes('/pages/') ? published : null,
            robotsHasUnpublishedChanges: false,
            pages: [{
              pageId: 'page-1',
              hasPublishedVersion: true,
              changedFields: draft.title === published.title ? [] : ['title'],
            }],
          },
        },
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.getByText('Matches the version on the site', { exact: true }).waitFor();
      expect(await f.page.locator('.page-tree ._draft-marker').count()).toBe(0);
      await f.page.locator('#page-title').fill('Saved draft title');
      await clickDraft(f.page);
      await f.page.locator('.page-tree ._draft-marker').waitFor();
      await f.page.waitForURL('**/admin/sites/site-1');
      expect(await f.page.locator('.page-tree ._draft-marker').count()).toBe(1);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('rebuilds published pages from Settings Main through the existing publication operation', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/settings');
      const rebuild = f.page.getByRole('button', { name: 'Rebuild site', exact: true });

      await rebuild.waitFor();
      expect(await f.page.getByText(/Unpublished page drafts are not published/).isVisible()).toBe(true);
      await rebuild.click();
      await f.page.getByRole('status').filter({ hasText: 'Site published' }).waitFor();
      expect(f.writes).toEqual([{ path: '/api/admin/sites/site-1/publish', body: {} }]);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('separates Main, SEO and Open Graph and selects a public library image without losing hidden fields', async () => {
    const f = await fixture();
    const folder = { folderId: 'social-images', name: 'Social images', parentId: null, root: 'images' };
    const image = {
      fileId: 'og-photo',
      folderId: folder.folderId,
      name: 'social.webp',
      mode: 'Responsive',
      hasVariants: true,
      mimeType: 'image/webp',
      byteSize: 100,
      originalDimensions: { width: 4000, height: 2100, aspectRatio: 1200 / 630 },
      outputs: [4000, 320, 800, 1200].map((width) => ({
        key: 'w' + width,
        url: width === 1200 ? '/assets/images/social.webp' : '/assets/images/social-' + width + '.webp',
        mimeType: 'image/webp',
        dimensions: { width, height: width * 630 / 1200, aspectRatio: 1200 / 630 },
      })),
    };

    try {
      await f.page.route('**/sites/site-1/settings', (route) => route.fulfill({
        json: {
          siteId: 'site-1',
          addresses: {
            publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100', originMode: 'Local',
          },
          timeZone: 'UTC',
        },
      }));
      await f.page.route((url) => url.pathname === '/api/admin/sites/site-1/files', (route) => {
        const query = new URL(route.request().url()).searchParams;

        if (query.has('fileId')) {
          return route.fulfill({ json: image });
        }

        const child = query.get('folderId') === folder.folderId;
        const files = child || !query.has('root') ? [image] : [];
        const folders = child ? [] : [folder];

        return route.fulfill({
          json: {
            version: 'media-1',
            pending: false,
            files,
            folders,
            breadcrumbs: child ? [folder] : [],
            paths: {},
            total: files.length + folders.length,
            fileTotal: files.length,
            folderTotal: folders.length,
          },
        });
      });
      await f.page.route('**/files/og-photo/content?*', (route) => route.fulfill({
        contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="63"/>',
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      const main = f.page.getByRole('tab', { name: 'Main', exact: true });
      const seo = f.page.getByRole('tab', { name: 'SEO', exact: true });
      const social = f.page.getByRole('tab', { name: 'Open Graph', exact: true });

      await seo.waitFor();
      expect(await f.page.getByRole('tab').count()).toBe(3);
      expect(await f.page.locator('#page-h1').isVisible()).toBe(true);
      await f.page.locator('#page-h1').fill('Main heading');
      await seo.click();
      expect(await f.page.locator('#page-h1').isVisible()).toBe(false);
      await f.page.locator('#page-meta-title').fill('Search title');
      await social.click();
      await f.page.locator('#page-og-title').fill('Social title');
      const trigger = f.page.getByRole('button', { name: 'Image for Open Graph', exact: true });

      await trigger.click();
      const dialog = f.page.getByRole('dialog', { name: 'Image library', exact: true });
      const tile = dialog.getByRole('button', { name: folder.name, exact: true });
      const trail = dialog.getByRole('navigation', { name: 'Breadcrumbs', exact: true });
      const returnToRoot = trail.getByRole('button', { name: 'assets/images', exact: true });
      const pageUrl = f.page.url();

      await tile.click();
      await trail.locator('[aria-current="page"]').filter({ hasText: folder.name }).waitFor();
      expect(await returnToRoot.getAttribute('class')).toBe('cms-breadcrumb-action');
      await returnToRoot.click();
      await tile.click();
      expect(f.page.url()).toBe(pageUrl);
      await dialog.getByRole('button', { name: 'social.webp', exact: true }).click();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await f.page.locator('#page-og-image').innerText()).toContain('Choose image');
      expect(await f.page.locator('.og-image-field input[type="url"]').count()).toBe(0);
      expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
      await trigger.click();
      await tile.click();
      await dialog.getByRole('button', { name: 'social.webp', exact: true }).click();
      await dialog.getByRole('button', { name: 'Use image', exact: true }).click();
      await vi.waitFor(async () => expect(await f.page.locator('#page-og-image').innerText()).toContain('social.webp'));
      expect(await f.page.locator('.og-image-field input[type="url"]').count()).toBe(0);
      await trigger.focus();
      await trigger.press('Enter');
      await dialog.waitFor();
      await f.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
      await f.page.getByRole('button', { name: 'Remove image: Image for Open Graph', exact: true }).click();
      expect(await trigger.innerText()).toContain('Choose image');
      expect(await dialog.count()).toBe(0);
      await trigger.press('Space');
      await tile.click();
      await dialog.getByRole('button', { name: 'social.webp', exact: true }).click();
      await dialog.getByRole('button', { name: 'Use image', exact: true }).click();
      expect(await f.page.getByRole('radio', { name: '1200 × 630 px', exact: true }).isChecked()).toBe(true);
      expect(await f.page.getByRole('radio', { name: '4000 × 2100 px', exact: true }).isChecked()).toBe(false);
      await f.page.getByRole('radio', { name: '800 × 420 px', exact: true }).check();
      expect(await f.page.getByRole('radio', { name: '1200 × 630 px', exact: true }).isChecked()).toBe(false);
      await f.page.getByRole('radio', { name: '800 × 420 px', exact: true }).focus();
      await f.page.keyboard.press('ArrowRight');
      expect(await f.page.getByRole('radio', { name: '1200 × 630 px', exact: true }).isChecked()).toBe(true);
      await f.page.keyboard.press('ArrowLeft');
      expect(await f.page.getByRole('radio', { name: '800 × 420 px', exact: true }).isChecked()).toBe(true);
      expect(f.writes).toHaveLength(0);
      await f.page.locator('#page-og-description').fill('Social description');
      await f.page.locator('#page-og-type').selectOption('article');

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 900 });
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          const imageBox = await f.page.locator('.og-image-field').boundingBox();
          const inputBox = await f.page.locator('.og-image-field ._media-file-control').boundingBox();
          const typeBox = await f.page.locator('#page-og-type').boundingBox();
          const descriptionBox = await f.page.locator('#page-og-description').boundingBox();

          if (width >= 576) {
            expect(typeBox!.x).toBeGreaterThanOrEqual(imageBox!.x + imageBox!.width);
          } else {
            expect(typeBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
          }
          expect(descriptionBox!.y).toBeGreaterThan(typeBox!.y);
          expect(inputBox!.height).toBe(48);

          if (width >= 576) {
            expect(inputBox!.y).toBe(typeBox!.y);
          }
        }
      }
      await f.page.locator('.admin-language select').selectOption('en');
      await f.page.setViewportSize({ width: 1440, height: 900 });
      await f.page.screenshot({ path: '.tmp/page-open-graph-desktop.png' });
      await f.page.setViewportSize({ width: 390, height: 900 });
      await f.page.screenshot({ path: '.tmp/page-open-graph-mobile.png' });
      await f.page.setViewportSize({ width: 1440, height: 900 });
      await main.click();
      expect(await f.page.locator('#page-h1').inputValue()).toBe('Main heading');
      await main.press('ArrowRight');
      expect(await seo.getAttribute('aria-selected')).toBe('true');
      await seo.press('End');
      expect(await social.getAttribute('aria-selected')).toBe('true');
      await clickDraft(f.page);
      await f.page.waitForURL('**/admin/sites/site-1');
      expect(f.writes[0]?.body).toMatchObject({
        h1: 'Main heading',
        metaTitle: 'Search title',
        ogTitle: 'Social title',
        ogDescription: 'Social description',
        ogType: 'article',
        ogImage: 'https://example.test/assets/images/social-800.webp',
      });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await social.click();
      await vi.waitFor(async () => expect(await f.page.getByRole('radio', {
        name: '800 × 420 px', exact: true,
      }).isChecked()).toBe(true));
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('configures Request page caching explicitly with 60 seconds initially and persists draft changes', async () => {
    const f = await fixture();

    try {
      await f.page.route('**/pages/page-1/publication', async (route) => route.fulfill({
        json: {
          templates: [{ templateId: 'Home', name: 'Home', requiresParameters: false }],
          pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
          templateId: 'Home',
          path: '/',
          requestDelivery: true,
          requestCache: f.writes.filter((write) => write.path.endsWith('/pages/page-1'))
            .at(-1)?.body.requestCache ?? null,
        },
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      const checkbox = f.page.getByRole('checkbox', { name: 'Enable shared server cache', exact: true });

      await checkbox.waitFor();
      expect(await checkbox.isChecked()).toBe(false);
      await checkbox.check();
      const ttl = f.page.getByLabel('Cache lifetime, seconds', { exact: true });

      expect(await ttl.inputValue()).toBe('60');
      const manifest: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));

      expect(await f.page.locator('._build-summary').innerText()).toBe('CMS Zarya v.' + manifest.version);
      const warning = f.page.locator('#page-request-cache-warning');

      expect(await warning.count()).toBe(0);
      await ttl.fill('10');
      await warning.waitFor();
      expect(await warning.innerText()).toContain('background refresh is disabled');
      expect(await ttl.getAttribute('aria-describedby')).toBe('page-request-cache-warning');
      await ttl.fill('20');
      expect(await warning.isVisible()).toBe(true);
      await f.page.locator('.admin-language select').selectOption('ru');
      await vi.waitFor(async () => expect(await warning.innerText()).toContain('фоновое обновление отключено'));

      for (const width of [320, 390, 768, 1440]) {
        await f.page.setViewportSize({ width, height: 900 });
        expect(await warning.isVisible()).toBe(true);
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await f.page.locator('.admin-language select').selectOption('en');
      await ttl.fill('21');
      await warning.waitFor({ state: 'detached' });
      await ttl.fill('90');
      await Promise.all([
        f.page.waitForResponse((response) => response.url().endsWith('/pages/page-1')
          && response.request().method() === 'POST'),
        clickDraft(f.page),
      ]);
      expect(f.writes.at(-1)?.body.requestCache).toEqual({ scope: 'SharedPublic', ttlMs: 90000 });
      await f.page.reload();
      await ttl.waitFor();
      expect(await ttl.inputValue()).toBe('90');
      expect(await checkbox.isChecked()).toBe(true);

      for (const width of [1440, 768, 390]) {
        await f.page.setViewportSize({ width, height: 900 });
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await checkbox.uncheck();
      await clickDraft(f.page);
      await f.page.waitForTimeout(200);
      expect(f.writes.at(-1)?.body.requestCache).toBeNull();
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('shadows source lists and editor bars only while their own pane is scrolled', async () => {
    const f = await fixture();

    try {
      for (const [section, key, kind] of [['templates', 'Home', 'Template'], ['chunks', 'Footer', 'Chunk'],
        ['snippets', 'Pagination', 'Snippet']]) {
        const original = f.records.get(section + '/' + key)!;

        for (let index = 0; index < 24; index++) {
          f.records.set(section + '/Extra' + index, { ...original, key: 'Extra' + index, name: 'Extra ' + index });
        }
        await f.page.setViewportSize({ width: 1440, height: 500 });
        await f.page.goto('http://localhost:31989/admin/sites/site-1/' + section + '/' + key);
        await f.page.locator('#element-' + kind + '-name').waitFor();
        const drawer = f.page.locator('#source-list-' + kind);
        const workspace = f.page.getByRole('main', {
          name: section === 'templates' ? 'Templates'
            : section === 'chunks' ? 'Chunks' : 'Snippets',
          exact: true,
        });

        await verifyScrollShadow(drawer.locator('._tree-scroll'), drawer.locator('._drawer-heading'));
        await verifyScrollShadow(workspace.locator('._workspace-scroll'), workspace.locator('._workspace-toolbar'));
        const scrollBox = await workspace.locator('._workspace-scroll').boundingBox();
        const editorBox = await workspace.locator('.element-editor').boundingBox();

        expect(editorBox!.x - scrollBox!.x).toBeLessThanOrEqual(40);
        expect(scrollBox!.x + scrollBox!.width - editorBox!.x - editorBox!.width).toBeLessThanOrEqual(56);
        const item = drawer.locator('._source-item:not([aria-current="page"])').first();

        expect(await item.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(233, 238, 226)');
        await item.hover();
        expect(await item.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(229, 236, 220)');

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440,
          575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 900 });
          expect(await workspace.locator('.element-editor').isVisible()).toBe(true);
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }

        if (section === 'templates') {
          await f.page.screenshot({ path: '.tmp/template-editor-desktop.png' });
        }
      }
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });
  it('shows Snippets alongside the other sections with contracts, responsive panels and deep links', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/snippets/Pagination');
      await f.page.locator('._workspace-toolbar > #element-Snippet-title').waitFor();
      expect(await f.page.locator('.element-editor h1').count()).toBe(0);

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);
        expect(await f.page.locator('.site-sections button').count()).toBe(11);
        expect(await f.page.locator('.site-sections button[aria-current="page"]').innerText())
          .toBe(language === 'en' ? 'Snippets' : 'Сниппеты');

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440,
          575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 800 });
          expect(await f.page.locator('#element-Snippet-title').isVisible()).toBe(true);
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
      }
      expect(await f.page.locator('#element-Snippet-server').inputValue()).toContain('return');
      await f.page.getByRole('checkbox', { name: 'Разрешить параллельное чтение (команды CMS запрещены)' }).check();
      await f.page.locator('#element-Snippet-server').fill('return "Edited snippet";');
      await Promise.all([
        f.page.waitForResponse((response) => response.request().method() === 'POST'
          && response.url().endsWith('/snippets/Pagination')),
        f.page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click(),
      ]);
      expect(f.writes).toEqual(expect.arrayContaining([expect.objectContaining({
        path: '/api/admin/sites/site-1/snippets/Pagination',
        body: expect.objectContaining({
          snippet: expect.objectContaining({ code: 'return "Edited snippet";', execution: 'ParallelRead' }),
        }),
      })]));
      await f.page.reload();
      await f.page.locator('#element-Snippet-title').waitFor();
      expect(await f.page.getByRole('checkbox', {
        name: 'Разрешить параллельное чтение (команды CMS запрещены)',
      }).isChecked()).toBe(true);
      expect(f.errors).toEqual([]);
      await f.page.locator('.site-sections button').first().click();
      await f.page.goBack();
      await f.page.locator('#element-Snippet-title').waitFor();
    } finally {
      await f.context.close();
    }
  });

  it('keeps the page action bar visible across scrolling, languages and responsive widths', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('#page-title').waitFor();
      const actions = f.page.locator('.page-actions');

      expect(await actions.evaluate((element) => element.closest('._workspace-scroll') === null)).toBe(true);

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 437, 440,
          575, 576, 767, 768, 927, 991, 992, 1199, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 700 });
          expect((await f.page.locator('#page-editor-title').boundingBox())!.height).toBeLessThan(30);
          const before = (await actions.boundingBox())!;
          const scroll = f.page.locator('#page-workspace ._workspace-scroll');

          await scroll.evaluate((element) => element.scrollTop = element.scrollHeight);
          expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
          const after = (await actions.boundingBox())!;

          expect(after.y).toBe(before.y);
          expect(after.y + after.height).toBeLessThanOrEqual(700);
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect(await f.page.getByRole('button', {
            name: language === 'en' ? 'Publish entire site' : 'Опубликовать весь сайт', exact: true,
          }).count()).toBe(0);
          const bounds = await actions.locator(':scope > button:visible').evaluateAll((buttons) =>
            buttons.map((button) => {
              const box = button.getBoundingClientRect();

              return { x: box.x, y: box.y, width: box.width, height: box.height };
            }));

          expect(bounds).toHaveLength(width >= 1200 ? 4 : 2);

          for (const box of bounds) {
            expect(box.height).toBe(36);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
          }
          expect(await f.page.locator('._page-title-row').evaluate((element) =>
            element.getBoundingClientRect().height)).toBe(width < 992 ? 36 : 32);

        }
      }
      await f.page.screenshot({ path: '.tmp/page-actions-desktop.png' });
      await f.page.setViewportSize({ width: 927, height: 885 });
      await f.page.screenshot({ path: '.tmp/page-actions-tablet.png' });
      await f.page.setViewportSize({ width: 437, height: 885 });
      await f.page.screenshot({ path: '.tmp/page-actions-mobile-wide.png' });
      await f.page.setViewportSize({ width: 320, height: 700 });
      await f.page.screenshot({ path: '.tmp/page-actions-mobile.png' });
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('places title and heading before template and URL in creation and editing', async () => {
    const f = await fixture();

    try {
      for (const pageId of ['new', 'page-1']) {
        f.state.publicationPath = pageId === 'new' ? null : '/';
        await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/' + pageId);
        await f.page.locator('#page-title').waitFor();
        expect(await f.page.locator('.page-editor form').locator('input, select, textarea')
          .evaluateAll((elements) => elements.slice(0, 4).map((element) => element.id)))
          .toEqual(['page-title', 'page-h1', 'page-template', 'page-path']);
      }
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each([200, 503])('reconciles a partially assigned URL after publication failure (read %s)', async (readStatus) => {
    const f = await fixture();
    const assignedPath = '/offers/card-gift-123.php';
    let publications = 0;

    f.state.publicationPath = null;

    try {
      await f.page.route('**/pages/page-1/publication', async (route) => {
        if (route.request().method() === 'POST') {
          publications++;
          await route.fulfill({ status: 500, json: { error: 'InternalError' } });

          return;
        }
        if (publications && readStatus !== 200) {
          await route.fulfill({ status: readStatus, json: { error: 'InternalError' } });

          return;
        }
        await route.fulfill({
          json: {
            templates: [{ templateId: 'Home', requiresParameters: false }],
            templateId: 'Home',
            path: publications ? assignedPath : null,
            pageAvailability: [{
              pageId: 'page-1',
              assignedPath: publications ? assignedPath : null,
              publicPath: null,
            }],
          },
        });
      });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/new');
      await f.page.locator('#page-template').selectOption('Home');
      await f.page.locator('#page-title').fill('Keep this gift draft');
      await f.page.locator('#page-path').fill(assignedPath);
      await f.page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await f.page.locator('.page-editor-controls [role="alert"]').filter({ hasText: 'Draft saved.' }).waitFor();
      await f.page.locator('#path-unassigned').waitFor({ state: 'hidden' });
      expect(await f.page.locator('#page-title').inputValue()).toBe('Keep this gift draft');
      expect(await f.page.locator('#page-path').inputValue()).toBe(assignedPath);
      expect(await f.page.locator('#page-path').evaluate((element: HTMLInputElement) => element.readOnly))
        .toBe(readStatus === 200);
      expect(publications).toBe(1);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('shows save and publication failures below the page action bar without losing the draft', async () => {
    const f = await fixture();

    try {
      await f.page.setViewportSize({ width: 320, height: 700 });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('#page-title').fill('Keep this draft');
      const alert = f.page.locator('.page-editor-controls [role="alert"]');

      await f.page.locator('#page-template').selectOption('');
      await f.page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await alert.waitFor();
      expect(await alert.textContent()).toContain('Choose a template');
      expect(f.writes).toHaveLength(0);
      await f.page.locator('#page-template').selectOption('Home');
      await f.page.locator('#page-workspace ._workspace-scroll').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      f.state.pageSaveStatus = 500;
      await clickDraft(f.page);
      await alert.waitFor();
      const actions = (await f.page.locator('.page-actions').boundingBox())!;
      const error = (await alert.boundingBox())!;

      expect(error.y).toBeGreaterThanOrEqual(actions.y + actions.height);
      expect(error.y + error.height).toBeLessThanOrEqual(700);
      expect(await f.page.locator('#page-title').inputValue()).toBe('Keep this draft');
      f.state.pageSaveStatus = 200;
      await f.page.route('**/pages/page-1/publication', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({ status: 409, json: { error: 'Conflict' } });
        } else {
          await route.fallback();
        }
      });
      await f.page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await alert.filter({ hasText: 'Draft saved.' }).waitFor();
      expect(await f.page.locator('#page-title').inputValue()).toBe('Keep this draft');

      const more = f.page.getByRole('button', { name: 'More', exact: true });

      await expect.poll(() => more.isEnabled()).toBe(true);
      await more.press('Enter');
      expect(await f.page.getByRole('button', { name: 'Save draft', exact: true }).isEnabled()).toBe(true);
      await f.page.screenshot({ path: '.tmp/page-actions-error.png' });
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('keeps native validation and Enter draft submission from the page action bar', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('#page-title').fill('');
      await clickDraft(f.page);
      expect(f.writes).toHaveLength(0);
      expect(await f.page.locator('#page-title').evaluate((element) => element === document.activeElement)).toBe(true);
      await f.page.locator('#page-title').fill('Keyboard draft');
      await f.page.locator('#page-title').press('Enter');
      await f.page.waitForURL('**/admin/sites/site-1');
      expect(f.writes).toHaveLength(1);
      expect(f.writes[0]?.path).toBe('/api/admin/sites/site-1/pages/page-1');
      expect(f.writes[0]?.body.title).toBe('Keyboard draft');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('focuses the invalid field after Save draft from the mobile More menu', async () => {
    const f = await fixture();

    try {
      await f.page.setViewportSize({ width: 390, height: 844 });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      const title = f.page.locator('#page-title');

      await title.fill('');
      await f.page.getByRole('tab', { name: 'SEO', exact: true }).click();
      await f.page.getByRole('button', { name: 'More', exact: true }).click();
      await f.page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect.poll(() => title.evaluate((element) => element === document.activeElement)).toBe(true);
      expect(await f.page.getByRole('tab', { name: 'Main', exact: true }).getAttribute('aria-selected')).toBe('true');
      expect(await f.page.getByRole('button', { name: 'Save draft', exact: true }).count()).toBe(0);
      expect(f.writes).toHaveLength(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });
  it('locks the page action bar while saving and keeps Cancel available before saving', async () => {
    const f = await fixture();
    let release = (): void => {};
    let observed = (): void => {};
    const pending = new Promise<void>((resolve) => release = resolve);
    const received = new Promise<void>((resolve) => observed = resolve);

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('#page-title').fill('Pending draft');
      await f.page.route('**/pages/page-1', async (route) => {
        if (route.request().method() === 'POST') {
          observed();
          await pending;
        }
        await route.fallback();
      });
      expect(await f.page.getByRole('button', { name: 'Cancel', exact: true }).isEnabled()).toBe(true);
      await clickDraft(f.page);
      await received;
      expect(await f.page.locator('.page-actions button:not(:disabled)').count()).toBe(0);
      release();
      await f.page.waitForURL('**/admin/sites/site-1');
      expect(f.writes).toHaveLength(1);
      expect(f.errors).toEqual([]);
    } finally {
      release();
      await f.context.close();
    }
  });

  it('suggests English/Russian slugs only for creation and preserves manual paths', async () => {
    const f = await fixture();

    f.state.publicationPath = null;

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/new');
      await f.page.locator('#page-path').waitFor();
      expect(await f.page.locator('#page-path').inputValue()).toBe('/');
      await f.page.locator('#page-title').fill('Second Page');
      expect(await f.page.locator('#page-path').inputValue()).toBe('/second-page/');
      await f.page.locator('#page-title').fill('Русское название страницы');
      expect(await f.page.locator('#page-path').inputValue()).toBe('/russkoe-nazvanie-stranitsy/');
      await f.page.locator('#page-path').fill('/custom/');
      await f.page.locator('#page-title').fill('Другой заголовок');
      expect(await f.page.locator('#page-path').inputValue()).toBe('/custom/');
      await f.page.locator('.admin-language select').selectOption('ru');
      expect(await f.page.locator('#page-path').inputValue()).toBe('/custom/');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('prefills the chosen parent folder and keeps automatic slugs inside it until manual input', async () => {
    const f = await fixture();

    f.state.publicationPath = null;

    try {
      await f.page.route('**/api/admin/sites/site-1/publication', (route) => route.fulfill({
        json: {
          templates: [{ templateId: 'Home', requiresParameters: false }],
          templateId: 'Home',
          path: null,
          pageAvailability: [{ pageId: 'page-1', assignedPath: '/articles', publicPath: '/articles' }],
        },
      }));
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/new');
      const path = f.page.locator('#page-path');
      const parent = f.page.locator('#page-parent');

      await expect.poll(() => path.inputValue()).toBe('/');
      await parent.selectOption('page-1');
      await expect.poll(() => path.inputValue()).toBe('/articles/');
      expect(await f.page.locator('#path-hint').innerText()).toContain('parent page URL (/articles/)');
      await f.page.locator('#page-title').fill('First child');
      await expect.poll(() => path.inputValue()).toBe('/articles/first-child/');
      await parent.selectOption({ label: 'Site root' });
      await expect.poll(() => path.inputValue()).toBe('/first-child/');
      await f.page.locator('#page-title').fill('?!');
      await expect.poll(() => path.inputValue()).toBe('/');
      await parent.selectOption('page-1');
      await expect.poll(() => path.inputValue()).toBe('/articles/');
      await path.fill('/manual/');
      await parent.selectOption({ label: 'Site root' });
      await f.page.locator('#page-title').fill('Another title');
      expect(await path.inputValue()).toBe('/manual/');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each(['Markdown', 'JSON-LD'].flatMap((format) => [true, false].map((published) => ({ format, published }))))(
    'shows escaped $format (published=$published) without saving local edits', async ({ format, published }) => {
      const f = await fixture();
      const { page } = f;
      const suffix = (format === 'JSON-LD' ? 'json-ld-' : 'markdown-') + (published ? 'published' : 'preview');
      const title = (published ? 'Published ' : 'Saved draft ') + format;
      const markdown = (published ? 'PUBLIC' : 'SAVED DRAFT') + '\n<script>window.injected = true</script>';
      const reads: string[] = [];

      try {
        await page.route('**/pages/page-1/' + suffix, async (route) => {
          reads.push(route.request().method());
          await route.fulfill({ json: format === 'JSON-LD' ? { jsonLd: markdown } : { markdown } });
        });
        await page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
        await page.locator('#page-content').fill('UNSAVED LOCAL BUFFER');
        await page.getByRole('button', { name: 'More', exact: true }).click();
        await page.getByRole('button', {
          name: format === 'JSON-LD' ? title : published ? 'View in MD' : 'View draft in MD', exact: true,
        }).click();
        const dialog = page.locator('dialog.markdown-dialog[open]');

        await dialog.waitFor();
        expect(await dialog.getByRole('heading').innerText()).toBe(title);
        expect(await dialog.locator('pre').textContent()).toBe(markdown);
        expect(await dialog.locator('script').count()).toBe(0);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        expect(await page.locator('#page-content').inputValue()).toBe('UNSAVED LOCAL BUFFER');
        expect(reads).toEqual(['GET']);
        expect(f.writes).toHaveLength(0);
        expect(f.errors).toEqual([]);
      } finally {
        await f.context.close();
      }
    });

  it('disables public Markdown for an unpublished page and retries a failed draft read without saving', async () => {
    const f = await fixture();
    const { page } = f;
    let status = 503;
    let reads = 0;

    try {
      f.state.publicationPath = null;
      await page.route('**/pages/page-1/markdown-preview', async (route) => {
        reads++;
        await route.fulfill({
          status,
          json: status === 200 ? { markdown: 'Recovered saved draft' }
            : { error: 'Unavailable' },
        });
      });
      await page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await page.locator('#page-content').fill('KEEP THIS EDIT');
      await page.getByRole('button', { name: 'More', exact: true }).click();
      expect(await page.getByRole('button', { name: 'View in MD', exact: true }).isDisabled()).toBe(true);
      await page.getByRole('button', { name: 'View draft in MD', exact: true }).click();
      await page.getByRole('alert').waitFor();
      expect(await page.locator('dialog.markdown-dialog[open]').count()).toBe(0);
      expect(await page.locator('#page-content').inputValue()).toBe('KEEP THIS EDIT');
      expect(reads).toBe(1);
      status = 200;
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('button', { name: 'View draft in MD', exact: true }).click();
      await page.locator('dialog.markdown-dialog[open] pre').waitFor();
      expect(await page.locator('dialog.markdown-dialog pre').textContent()).toBe('Recovered saved draft');
      await page.locator('dialog.markdown-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(reads).toBe(2);
      expect(f.writes).toHaveLength(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('keeps an existing URL while editing title and round-trips SEO/social fields through draft saves', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.locator('#page-path').waitFor();
      await f.page.locator('#page-title').fill('Renamed page');
      expect(await f.page.locator('#page-path').inputValue()).toBe('/');
      await f.page.locator('#page-h1').fill('Main heading');
      await f.page.getByRole('tab', { name: 'SEO', exact: true }).click();
      await f.page.locator('#page-meta-title').fill('Search title');
      await f.page.locator('#page-meta-description').fill('Search description');
      await f.page.locator('#page-robots').selectOption('noindex');
      await f.page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
      await f.page.locator('#page-og-title').fill('Social title');
      await f.page.locator('#page-og-description').fill('Social description');
      expect(await f.page.getByRole('button', { name: 'Image for Open Graph', exact: true }).isVisible()).toBe(true);
      await f.page.locator('#page-og-type').selectOption('article');

      for (const width of [320, 768, 1440]) {
        await f.page.setViewportSize({ width, height: 900 });
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await clickDraft(f.page);
      await f.page.waitForURL('**/admin/sites/site-1');
      expect(f.writes[0]?.body).toMatchObject({
        title: 'Renamed page',
        h1: 'Main heading',
        metaTitle: 'Search title',
        metaDescription: 'Search description',
        robotsIndex: false,
        ogTitle: 'Social title',
        ogDescription: 'Social description',
        ogImage: null,
        ogType: 'article',
      });
      expect(f.writes[0]?.body).not.toHaveProperty('path');
      await f.page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
      await f.page.getByRole('tab', { name: 'SEO', exact: true }).click();
      expect(await f.page.locator('#page-meta-title').inputValue()).toBe('Search title');
      expect(await f.page.locator('#page-robots').inputValue()).toBe('noindex');
      await f.page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
      expect(await f.page.locator('#page-og-title').inputValue()).toBe('Social title');
      await f.page.locator('#page-og-title').fill('');
      await clickDraft(f.page);
      await f.page.waitForURL('**/admin/sites/site-1');
      expect(f.writes[1]?.body.ogTitle).toBeNull();
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each([['templates', 'Template'], ['chunks', 'Chunk']])(
    'round-trips nested parameter kinds, falsy defaults and removal in %s',
    async (section, kind) => {
      const f = await fixture();
      const { page } = f;
      const prefix = '#element-' + kind;
      const row = (index: number): Locator => page.locator('fieldset._parameter-row')
        .filter({ has: page.locator(prefix + '-' + index + '-kind') }).last();
      const add = async (name: string, type: string, index: number): Promise<void> => {
        await page.getByRole('button', { name: 'Add parameter', exact: true }).last().click();
        await page.locator(prefix + '-' + index + '-name').fill(name);
        await page.locator(prefix + '-' + index + '-kind').selectOption(type);
      };

      try {
        await page.goto('http://localhost:31989/admin/sites/site-1/' + section + '/-/new');
        await page.getByLabel('Element name', { exact: true }).fill('Complex contract');
        await page.getByRole('button', { name: 'Parameters', exact: true }).click();
        await add('settings', 'Object', 0);
        await row(0).getByRole('button', { name: 'Add parameter', exact: true }).click();
        await page.locator(prefix + '-0-properties-0-name').fill('enabled');
        await page.locator(prefix + '-0-properties-0-kind').selectOption('Boolean');
        await row(0).getByRole('checkbox', { name: 'Use a default value', exact: true }).last().check();
        await add('labels', 'Array', 1);
        await page.locator(prefix + '-1-items-0-kind').selectOption('Enum');
        await page.locator(prefix + '-1-items-0-values').fill('alpha\nbeta');
        await row(1).getByRole('checkbox', { name: 'Use a default value', exact: true }).last().check();
        await page.locator(prefix + '-1-items-0-default').fill('alpha');
        await add('count', 'Number', 2);
        await row(2).getByRole('checkbox', { name: 'Use a default value', exact: true }).check();
        await add('enabled', 'Boolean', 3);
        await row(3).getByRole('checkbox', { name: 'Use a default value', exact: true }).check();
        await add('optional', 'String', 4);
        await row(4).getByRole('checkbox', { name: 'Allow null', exact: true }).check();
        await row(4).getByRole('checkbox', { name: 'Use a default value', exact: true }).check();
        await row(4).getByRole('checkbox', { name: 'Use null as default', exact: true }).check();
        await clickDraft(page);
        await page.waitForURL('**/' + section + '/1');
        const parameters = [
          {
            name: 'settings',
            kind: 'Object',
            required: false,
            properties: [
              { name: 'enabled', kind: 'Boolean', required: false, defaultValue: false },
            ],
          },
          {
            name: 'labels',
            kind: 'Array',
            required: false,
            items:
            { name: 'item', kind: 'Enum', required: false, values: ['alpha', 'beta'], defaultValue: 'alpha' },
          },
          { name: 'count', kind: 'Number', required: false, defaultValue: 0 },
          { name: 'enabled', kind: 'Boolean', required: false, defaultValue: false },
          { name: 'optional', kind: 'String', required: false, nullable: true, defaultValue: null },
        ];

        expect(f.writes.at(-1)?.body.parameters).toEqual(parameters);
        await page.reload();
        await page.getByRole('button', { name: 'Parameters', exact: true }).click();
        expect(await page.locator(prefix + '-2-default').inputValue()).toBe('0');
        expect(await page.locator(prefix + '-3-default').inputValue()).toBe('false');
        expect(await row(4).getByRole('checkbox', { name: 'Use null as default', exact: true }).isChecked()).toBe(true);
        await row(4).getByRole('checkbox', { name: 'Use a default value', exact: true }).uncheck();
        await page.locator(prefix + '-1-kind').selectOption('String');
        await row(0).getByRole('button', { name: 'Remove parameter', exact: true }).first().click();
        await clickDraft(page);
        expect(f.writes.at(-1)?.body.parameters).toEqual([
          { name: 'settings', kind: 'Object', required: false, properties: [] },
          { name: 'labels', kind: 'String', required: false },
          ...parameters.slice(2, 4),
          { name: 'optional', kind: 'String', required: false, nullable: true },
        ]);
        expect(f.errors).toEqual([]);
      } finally {
        await f.context.close();
      }
    },
  );

  it.each([
    ['templates', 'Template', 'Object', '{"enabled":false}', { enabled: false }],
    ['chunks', 'Chunk', 'Array', '[false,true]', [false, true]],
  ] as const)('rejects malformed JSON defaults locally and saves corrected %s contracts', async (
    section, kind, parameterKind, json, expected,
  ) => {
    const f = await fixture();
    const { page } = f;

    try {
      await page.goto('http://localhost:31989/admin/sites/site-1/' + section + '/-/new');
      await page.getByLabel('Element name', { exact: true }).fill('JSON default');
      await page.getByRole('button', { name: 'Parameters', exact: true }).click();
      await page.getByRole('button', { name: 'Add parameter', exact: true }).last().click();
      const prefix = '#element-' + kind + '-0';

      await page.locator(prefix + '-name').fill('configuration');
      await page.locator(prefix + '-kind').selectOption(parameterKind);
      const row = page.locator('fieldset._parameter-row').filter({ has: page.locator(prefix + '-kind') }).last();

      if (parameterKind === 'Object') {
        await row.getByRole('button', { name: 'Add parameter', exact: true }).last().click();
        await page.locator(prefix + '-properties-0-name').fill('enabled');
        await page.locator(prefix + '-properties-0-kind').selectOption('Boolean');
      } else {
        await page.locator(prefix + '-items-0-kind').selectOption('Boolean');
      }
      await row.getByRole('checkbox', { name: 'Use a default value', exact: true }).first().check();
      await page.locator(prefix + '-default').fill('{');
      await clickDraft(page);
      expect(f.writes).toHaveLength(0);
      expect(await page.locator(prefix + '-default').evaluate((input) =>
        input instanceof HTMLInputElement && input.validity.customError)).toBe(true);
      await page.locator(prefix + '-default').fill(json);
      await clickDraft(page);
      await page.waitForURL(new RegExp('/' + section + '/1$'));
      expect(f.writes.at(-1)?.body.parameters).toEqual([
        expect.objectContaining({ name: 'configuration', kind: parameterKind, defaultValue: expected }),
      ]);
      await page.reload();
      await page.getByRole('button', { name: 'Parameters', exact: true }).click();
      expect(await page.locator(prefix + '-default').inputValue()).toBe(json);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('persists Snippet phases, cache limits and structured result contracts and clears opt-ins', async () => {
    const f = await fixture();
    const { page } = f;

    try {
      await page.goto('http://localhost:31989/admin/sites/site-1/snippets/Pagination');
      await page.getByRole('checkbox', { name: 'Request', exact: true }).uncheck();
      await page.getByRole('checkbox', {
        name: 'Allow public document caching (CMS commands disabled)', exact: true,
      }).check();
      const age = page.getByLabel('Maximum accepted data age, seconds', { exact: true });

      await age.fill('0');
      await clickDraft(page);
      expect(f.writes).toHaveLength(0);
      await age.fill('3601');
      await clickDraft(page);
      expect(f.writes).toHaveLength(0);
      await age.fill('17');
      await page.getByRole('button', { name: 'Result contract', exact: true }).click();
      await page.locator('#element-Snippet-output-0-kind').selectOption('Object');
      await page.locator('fieldset._parameter-row')
        .filter({ has: page.locator('#element-Snippet-output-0-kind') }).last()
        .getByRole('button', { name: 'Add parameter', exact: true }).last().click();
      await page.locator('#element-Snippet-output-0-properties-0-name').fill('total');
      await page.locator('#element-Snippet-output-0-properties-0-kind').selectOption('Number');
      await clickDraft(page);
      await expect.poll(() => f.writes.at(-1)?.body.snippet).toMatchObject({
        phases: ['Build'],
        cache: { scope: 'SharedPublic', maxAgeMs: 17000 },
        output: { kind: 'Object', properties: [{ name: 'total', kind: 'Number' }] },
      });
      await page.reload();
      expect(await page.getByRole('checkbox', { name: 'Request', exact: true }).isChecked()).toBe(false);
      expect(await age.inputValue()).toBe('17');
      await page.getByRole('checkbox', { name: 'Build', exact: true }).uncheck();
      await page.getByRole('checkbox', { name: 'Request', exact: true }).check();
      await page.getByRole('checkbox', {
        name: 'Allow public document caching (CMS commands disabled)', exact: true,
      }).uncheck();
      await page.getByRole('checkbox', { name: 'Allow parallel reads (CMS commands disabled)', exact: true }).check();
      await clickDraft(page);
      await expect.poll(() => f.writes.at(-1)?.body.snippet).toMatchObject({
        phases: ['Request'], execution: 'ParallelRead',
      });
      expect(f.writes.at(-1)?.body.snippet).not.toHaveProperty('cache');
      await page.reload();
      await page.getByRole('checkbox', { name: 'Allow parallel reads (CMS commands disabled)', exact: true })
        .uncheck();
      await clickDraft(page);
      await expect.poll(() => f.writes.at(-1)?.body.snippet).toMatchObject({ execution: 'Sequential' });
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('creates and saves all source fields with typed parameters using the secondary draft action', async() => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks');
      await f.page.getByRole('button', { name: 'Create element', exact: true }).click();
      await f.page.getByLabel('Element name', { exact: true }).fill('Contact');
      expect(await f.page.getByLabel('Element key', { exact: true }).count()).toBe(0);
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<section>Contact</section>');
      await f.page.getByRole('button', { name: 'CSS', exact: true }).click();
      await f.page.getByRole('textbox', { name: 'CSS', exact: true }).fill('section{padding:24px}');
      await f.page.getByRole('button', { name: 'Browser TypeScript', exact: true }).click();
      await f.page.getByRole('textbox', { name: 'Browser TypeScript', exact: true })
        .fill('document.body.dataset.ready = "yes";');
      await f.page.getByRole('button', { name: 'Parameters', exact: true }).click();
      await f.page.getByRole('button', { name: 'Add parameter', exact: true }).click();
      await f.page.getByLabel('Name', { exact: true }).fill('title');
      await f.page.getByRole('checkbox', { name: 'Use a default value', exact: true }).check();
      await f.page.getByLabel('Default value', { exact: true }).fill('Contact');
      expect(await f.page.getByRole('button', { name: 'Save draft', exact: true }).getAttribute('class'))
        .toBe('cms-secondary');
      await clickDraft(f.page);
      await f.page.waitForURL('**/chunks/1');
      await f.page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
      expect(f.writes).toHaveLength(1);
      expect(f.writes[0]?.body).toMatchObject({
        name: 'Contact',
        html: '<section>Contact</section>',
        css: 'section{padding:24px}',
        browserTypeScript: 'document.body.dataset.ready = "yes";',
        parameters: [{ name: 'title', kind: 'String', required: false, defaultValue: 'Contact' }],
      });
      expect(f.writes[0]?.body).not.toHaveProperty('key');
      expect(f.records.get('chunks/1')?.name).toBe('Contact');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('shows editable names in the drawer and preserves legacy keys when renaming', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/templates/Home');
      await f.page.getByLabel('Element name', { exact: true }).fill('Главный шаблон');
      await clickDraft(f.page);
      await f.page.getByRole('heading', { name: 'Главный шаблон', exact: true }).waitFor();
      await f.page.locator('.source-list').getByRole('button', { name: 'Главный шаблон', exact: true }).waitFor();
      expect(f.writes[0]?.path).toBe('/api/admin/sites/site-1/templates/Home');
      expect(f.writes[0]?.body.name).toBe('Главный шаблон');
      expect(f.writes[0]?.body).not.toHaveProperty('key');
      await f.page.getByRole('searchbox').fill('Главный');
      expect(await f.page.locator('.source-list button').count()).toBe(1);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('explains real parameter values and links to their editors', async () => {
    const f = await fixture();

    try {
      f.records.set('chunks/24', {
        ...f.records.get('chunks/Footer'),
        key: '24',
        name: 'UpcomingSection',
        html: '<p>[[+upcoming.message]]</p><p>[[+readyMessage]]</p>',
        parameters: [
          {
            name: 'upcoming',
            kind: 'Object',
            required: true,
            properties: [
              { name: 'message', kind: 'String', required: true },
            ],
          },
          { name: 'readyMessage', kind: 'String', required: false, defaultValue: 'Live schedule' },
        ],
        usages: [{ kind: 'Template', id: 'Home', title: 'Home template', readable: true }],
      });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/24');
      const help = f.page.getByRole('region', { name: /^(Using this element|Использование элемента)$/ });

      await help.locator('summary').click();
      await help.getByText('[[+upcoming.message]]', { exact: true }).waitFor();
      await help.getByText('Live schedule', { exact: true }).waitFor();
      expect(await help.textContent()).not.toContain('add title');
      const parameters = help.getByRole('link', { name: 'Edit parameter defaults' });

      expect(await parameters.getAttribute('href')).toBe('/admin/sites/site-1/chunks/24?file=parameters');
      expect(await help.getByRole('link', { name: 'Home template' }).getAttribute('href'))
        .toBe('/admin/sites/site-1/templates/Home');
      await parameters.click();
      const tab = f.page.getByRole('button', { name: 'Parameters', exact: true });

      expect(await tab.getAttribute('aria-pressed')).toBe('true');
      await f.page.locator('#element-Chunk-1-default').fill('Custom schedule');
      await help.getByText('Custom schedule', { exact: true }).waitFor();
      await clickDraft(f.page);
      expect(f.writes.at(-1)?.body.parameters).toMatchObject([
        { name: 'upcoming' }, { name: 'readyMessage', defaultValue: 'Custom schedule' },
      ]);
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/24?file=parameters');
      await expect.poll(async () => f.page.locator('#element-Chunk-1-default').inputValue()).toBe('Custom schedule');
      await f.page.locator('.admin-language select').selectOption('ru');
      await help.locator('summary').click();
      expect(await help.textContent()).toContain('значение');
      await help.screenshot({ path: '.tmp/real-parameter-help-1440.png' });
      await f.page.setViewportSize({ width: 320, height: 900 });
      await help.screenshot({ path: '.tmp/real-parameter-help-320.png' });

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await f.page.setViewportSize({ width, height: 900 });
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('updates usage hints with the name, retains the real chunk key and documents Snippet syntax', async () => {
    const f = await fixture();

    try {
      f.records.set('chunks/1', { ...f.records.get('chunks/Footer'), key: '1', name: 'DateChunk' });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/1');
      const help = f.page.getByRole('region', { name: /^(Using this element|Использование элемента)$/ });

      await help.waitFor();
      expect(await help.textContent()).toContain('DateChunk');
      expect(await help.locator('code').first().textContent()).toBe('[[$DateChunk]]');
      await f.page.getByLabel('Element name', { exact: true }).fill('Current Date');
      expect(await help.textContent()).toContain('Current Date');
      expect(await help.textContent()).not.toContain('DateChunk');
      expect(await help.locator('code').first().textContent()).toBe('[[$Current_Date]]');
      await help.getByText('[[$1]]', { exact: true }).waitFor();
      await help.locator('summary').click();
      await help.getByText('<span>[[+title]]</span>', { exact: true }).waitFor();
      await help.getByText('[[$Current_Date? &title=`[[*title]]`]]', { exact: true }).waitFor();

      for (const code of ['[[Snippet? &as=`data`]]', '[[!Snippet? &as=`data`]]', '[[+data.value]]', '[[*title]]']) {
        await help.getByText(code, { exact: true }).waitFor();
      }
      expect(await help.textContent()).toContain('registered');
      await help.screenshot({ path: '.tmp/source-usage-help-en.png' });
      await f.page.locator('.admin-language select').selectOption('ru');
      expect(await help.textContent()).toContain('Current Date');
      expect(await help.textContent()).toContain('зарегистрированного');
      expect(await help.locator('code').first().textContent()).toBe('[[$Current_Date]]');
      await f.page.getByLabel('Имя элемента', { exact: true }).fill('Дата события');
      expect(await help.locator('code').first().textContent()).toBe('[[$Дата_события]]');
      await f.page.getByLabel('Имя элемента', { exact: true }).fill('CurrentDate $& <Clock>');
      expect(await help.textContent()).toContain('CurrentDate $& <Clock>');
      expect(await help.locator('code').first().textContent()).toBe('[[$1]]');
      expect(await help.locator('clock').count()).toBe(0);

      for (const width of [320, 390, 768, 992, 1440]) {
        await f.page.setViewportSize({ width, height: 900 });
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const first = (await help.locator('code').first().boundingBox())!;

        expect(first.width).toBeGreaterThan(0);
        expect(first.width).toBeLessThanOrEqual(width);
      }
      await f.page.setViewportSize({ width: 390, height: 844 });
      await help.screenshot({ path: '.tmp/source-usage-help-ru-mobile.png' });
      expect(f.writes).toHaveLength(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('uses distinct source icons and leaves an unsaved chunk without a fake key', async () => {
    const f = await fixture();

    try {
      const icons: string[] = [];

      for (const [section, original] of [['templates', 'Home'], ['chunks', 'Footer']] as const) {
        f.records.set(section + '/2', {
          ...f.records.get(section + '/' + original), key: '2', name: 'Second element',
        });
        await f.page.goto('http://localhost:31989/admin/sites/site-1/' + section);
        const symbols = f.page.locator('.source-list svg');

        await expect.poll(() => symbols.count()).toBe(2);
        const first = (await symbols.first().innerHTML()).trim();

        expect((await symbols.nth(1).innerHTML()).trim()).toBe(first);
        expect(await symbols.first().getAttribute('aria-hidden')).toBe('true');
        expect((await symbols.first().boundingBox())!.width).toBe(18);
        icons.push(first);
      }
      expect(icons[0]).not.toBe(icons[1]);
      await f.page.getByRole('button', { name: 'Create element', exact: true }).click();
      await f.page.getByLabel('Element name', { exact: true }).fill('Unsaved date');
      const help = f.page.getByRole('region', { name: /^(Using this element|Использование элемента)$/ });

      expect(await help.textContent()).toContain('Unsaved date');
      expect(await help.textContent()).toContain('Save');
      expect(await help.locator('code:visible').count()).toBe(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each(['name', 'key'])('suggests the stable key when the name tag collides with another %s', async (collision) => {
    const f = await fixture();

    try {
      const original = f.records.get('chunks/Footer');

      f.records.set('chunks/1', { ...original, key: '1', name: 'Date Chunk' });
      f.records.set('chunks/' + (collision === 'key' ? 'Date_Chunk' : '2'), {
        ...original, key: collision === 'key' ? 'Date_Chunk' : '2', name: collision === 'name' ? 'Date_Chunk' : 'Other',
      });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/1');
      const help = f.page.getByRole('region', { name: /^(Using this element|Использование элемента)$/ });

      await help.waitFor();
      expect(await help.locator('code').first().textContent()).toBe('[[$1]]');
      expect(await help.textContent()).toContain('conflicts');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each(['pages', 'templates', 'chunks'])('shows %s entries with a contrasting selection', async (section) => {
    const f = await fixture();

    try {
      const suffix = section === 'pages' ? '' : '/' + section;

      await f.page.goto('http://localhost:31989/admin/sites/site-1' + suffix);
      const item = f.page.locator(section === 'pages' ? '._tree-page' : '._source-item').first();

      await item.waitFor();
      await f.page.mouse.move(0, 0);
      expect(await item.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(233, 238, 226)');
      expect(await item.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
      await item.click();
      await f.page.mouse.move(0, 0);
      await expect.poll(() => item.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe('rgb(49, 88, 62)');
      await f.page.locator('.page-drawer:visible').screenshot({ path: '.tmp/' + section + '-drawer-selected.png' });
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each(['templates', 'chunks'])('saves then applies new %s through the primary action', async (section) => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/' + section + '/-/new');
      await f.page.getByLabel('Element name', { exact: true }).fill('NewElement');
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<section>Applied</section>');
      const apply = f.page.getByRole('button', { name: 'Save & apply', exact: true });

      expect(await apply.getAttribute('class')).toBe('cms-primary');
      await apply.click();
      await f.page.getByText('Changes saved and applied. Site published.', { exact: true }).waitFor();
      await f.page.waitForURL('**/' + section + '/1');
      expect(f.writes.map((write) => write.path)).toEqual([
        '/api/admin/sites/site-1/' + section, '/api/admin/sites/site-1/publish',
      ]);
      expect(f.writes[0]?.body.html).toBe('<section>Applied</section>');
      expect(await f.page.getByText('Draft saved. The public site has not changed.', { exact: true }).count()).toBe(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each(['conflict', 'backup'])('does not apply after a source %s failure', async (failure) => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/templates/Home');
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<html>Kept</html>');
      f.state.status = failure === 'conflict' ? 409 : 200;
      f.state.pendingBackup = failure === 'backup';
      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await f.page.getByRole('alert').waitFor();
      expect(f.writes.map((write) => write.path)).toEqual(['/api/admin/sites/site-1/templates/Home']);
      expect(await f.page.getByRole('textbox', { name: 'HTML', exact: true }).inputValue()).toBe('<html>Kept</html>');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each([409, 500])('keeps the draft after publication fails with %i and permits retry', async (status) => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/-/new');
      await f.page.getByLabel('Element name', { exact: true }).fill('Kept');
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<footer>Saved</footer>');
      f.state.publicationStatus = status;
      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await f.page.getByText(/Draft saved. Applying changes could not be confirmed/).waitFor();
      await f.page.waitForURL('**/chunks/1');
      expect(await f.page.getByRole('textbox', { name: 'HTML', exact: true }).inputValue())
        .toBe('<footer>Saved</footer>');
      expect(await f.page.locator('.cms-success').count()).toBe(0);
      expect(f.writes).toHaveLength(2);
      f.state.publicationStatus = 200;
      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await f.page.getByText('Changes saved and applied. Site published.', { exact: true }).waitFor();
      expect(f.writes[2]?.path).toBe('/api/admin/sites/site-1/chunks/1');
      expect(f.writes[2]?.body.expectedVersion).toBe('v2');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('explains a rejected publication and links the undeclared parameter to its chunk', async () => {
    const f = await fixture();

    try {
      f.records.set('chunks/1', { ...f.records.get('chunks/Footer'), key: '1', name: 'DateChunk' });
      f.state.publicationStatus = 400;
      f.state.publicationDiagnostic = {
        issue: 'UnknownChunkParameter',
        source: { kind: 'Chunk', key: '1' },
        parameter: 'title',
        privateValue: 'must not appear',
      };
      await f.page.goto('http://localhost:31989/admin/sites/site-1/templates/Home');
      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await f.page.getByText(/Draft saved. Publication was rejected/).waitFor();
      const error = f.page.getByRole('alert');

      expect(await error.textContent()).toContain('title');
      expect(await error.textContent()).toContain('Parameters');
      expect(await error.textContent()).not.toContain('could not be confirmed');
      expect(await error.textContent()).not.toContain('must not appear');
      await f.page.locator('.admin-language select').selectOption('ru');
      expect(await error.textContent()).toContain('не объявлен');
      await f.page.getByRole('button', { name: 'Открыть указанный элемент', exact: true }).click();
      await f.page.waitForURL('**/chunks/1');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('stays on login if the session expires between creating and applying the element', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/-/new');
      await f.page.getByLabel('Element name', { exact: true }).fill('Expired');
      f.state.publicationStatus = 401;
      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await f.page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
      expect(f.page.url()).toBe('http://localhost:31989/admin/login');
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('validates before applying and keeps the keyboard shortcut as a draft save', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/-/new');
      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      const valid = await f.page.getByLabel('Element name', { exact: true })
        .evaluate((input: HTMLInputElement) => input.validity.valid);

      expect(valid).toBe(false);
      expect(f.writes).toHaveLength(0);
      await f.page.getByLabel('Element name', { exact: true }).fill('Shortcut');
      const html = f.page.getByRole('textbox', { name: 'HTML', exact: true });

      await html.fill('<footer>Shortcut</footer>');
      await html.press('Control+s');
      await f.page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
      expect(f.writes.map((write) => write.path)).toEqual(['/api/admin/sites/site-1/chunks']);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('locks the editor and navigation until source saving and publication both finish', async () => {
    const f = await fixture();
    let releaseSave = (): void => {};
    let releasePublication = (): void => {};
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });

    try {
      await f.page.route('**/api/admin/sites/site-1/templates/Home', async (route) => {
        if (route.request().method() === 'POST') {
          await saveGate;
        }
        await route.fallback();
      });
      await f.page.route('**/api/admin/sites/site-1/publish', async (route) => {
        await publicationGate;
        await route.fallback();
      });
      await f.page.goto('http://localhost:31989/admin/sites/site-1/templates/Home');
      const saving = f.page.waitForRequest((request) => request.method() === 'POST'
        && request.url().endsWith('/templates/Home'));

      await f.page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await saving;
      expect(await f.page.getByRole('textbox', { name: 'HTML', exact: true }).isDisabled()).toBe(true);
      expect(await f.page.locator('.site-sections button:enabled').count()).toBe(0);
      expect(await f.page.locator('.element-editor button:enabled').count()).toBe(0);
      expect(f.writes).toHaveLength(0);
      const publishing = f.page.waitForRequest((request) => request.url().endsWith('/publish'));

      releaseSave();
      await publishing;
      expect(await f.page.getByRole('textbox', { name: 'HTML', exact: true }).isDisabled()).toBe(true);
      expect(await f.page.locator('.site-sections button:enabled').count()).toBe(0);
      expect(await f.page.locator('.element-editor button:enabled').count()).toBe(0);
      expect(f.writes).toHaveLength(1);
      releasePublication();
      await f.page.getByText('Changes saved and applied. Site published.', { exact: true }).waitFor();
      expect(await f.page.getByRole('button', { name: 'Save & apply', exact: true }).isEnabled()).toBe(true);
      expect(f.errors).toEqual([]);
    } finally {
      releaseSave();
      releasePublication();
      await f.context.close();
    }
  });

  it('uses the same centered create control for sites, pages, templates and chunks', async () => {
    const f = await fixture();

    try {
      for (const width of [320, 390, 768, 992, 1440]) {
        await f.page.setViewportSize({ width, height: 900 });
        let original: { width: number; height: number } | undefined;

        for (const [route, label] of [
          ['/admin/sites/site-1', 'Create page'],
          ['/admin/sites/site-1/templates', 'Create element'],
          ['/admin/sites/site-1/chunks', 'Create element'],
          ['/admin/sites', 'Create site'],
        ] as const) {
          await f.page.goto('http://localhost:31989' + route);
          await f.page.mouse.move(0, 0);
          const button = f.page.getByRole('button', { name: label, exact: true });
          const screenshot = await button.screenshot();
          const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const ink: { x: number; y: number }[] = [];

          for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
              const offset = (y * info.width + x) * info.channels;

              if (data[offset]! < 130 && data[offset + 1]! < 150 && data[offset + 2]! < 130) {
                ink.push({ x, y });
              }
            }
          }
          expect(ink.length).toBeGreaterThan(0);
          const left = Math.min(...ink.map((pixel) => pixel.x));
          const right = Math.max(...ink.map((pixel) => pixel.x));
          const top = Math.min(...ink.map((pixel) => pixel.y));
          const bottom = Math.max(...ink.map((pixel) => pixel.y));

          expect(Math.abs((left + right + 1) / 2 - info.width / 2), route + '/' + width).toBeLessThanOrEqual(1);
          expect(Math.abs((top + bottom + 1) / 2 - info.height / 2), route + '/' + width).toBeLessThanOrEqual(1);

          if (original) {
            expect(Math.abs(right - left - original.width)).toBeLessThanOrEqual(1);
            expect(Math.abs(bottom - top - original.height)).toBeLessThanOrEqual(1);
          } else {
            original = { width: right - left, height: bottom - top };
          }

          const bounds = (await button.boundingBox())!;

          expect(bounds.width).toBe(width < 992 ? 36 : 44);
          expect(bounds.height).toBe(width < 992 ? 36 : 44);
        }
      }
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('assigns a numeric key and preserves nullable defaults when renaming', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/-/new');
      await f.page.getByLabel('Element name', { exact: true }).fill('new');
      await f.page.getByRole('button', { name: 'Parameters', exact: true }).click();
      await f.page.getByRole('button', { name: 'Add parameter', exact: true }).click();
      await f.page.getByLabel('Name', { exact: true }).fill('optional');
      await f.page.getByRole('checkbox', { name: 'Allow null', exact: true }).check();
      await f.page.getByRole('checkbox', { name: 'Use a default value', exact: true }).check();
      await f.page.getByRole('checkbox', { name: 'Use null as default', exact: true }).check();
      await clickDraft(f.page);
      await f.page.waitForURL('**/chunks/1');
      expect(await f.page.getByLabel('Element name', { exact: true }).getAttribute('readonly')).toBeNull();
      await f.page.getByLabel('Element name', { exact: true }).fill('Renamed footer');
      expect(f.writes[0]?.body.parameters).toEqual([
        expect.objectContaining({ name: 'optional', nullable: true, defaultValue: null }),
      ]);
      await f.page.getByRole('button', { name: 'HTML', exact: true }).click();
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<section>Updated</section>');
      await clickDraft(f.page);
      await f.page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
      expect(f.writes).toHaveLength(2);
      expect(f.writes[1]?.path).toBe('/api/admin/sites/site-1/chunks/1');
      expect(f.writes[1]?.body.expectedVersion).toBeTruthy();
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it.each([['templates', 'Home'], ['chunks', 'Footer']])('keeps %s usable with missing media', async (section, key) => {
    const f = await fixture();
    const source = f.records.get(section + '/' + key)!;

    source.html = '<img src="/assets/images/removed.png">';
    source.css = 'a{background:url("/assets/images/removed--w320.webp")}';
    source.browserTypeScript = 'const file = "/assets/files/gone.pdf";';

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/' + section + '/' + key);
      const html = f.page.getByRole('textbox', { name: 'HTML', exact: true });

      await html.waitFor();
      expect(await html.inputValue()).toBe(source.html);
      await f.page.getByRole('status').filter({
        hasText: 'The file at this address does not exist: /assets/images/removed.png',
      }).waitFor();
      await f.page.getByRole('button', { name: 'CSS', exact: true }).click();
      expect(await f.page.getByRole('textbox', { name: 'CSS', exact: true }).inputValue()).toBe(source.css);
      await f.page.getByRole('status').filter({ hasText: '/assets/images/removed--w320.webp' }).waitFor();
      await f.page.getByRole('button', { name: 'Browser TypeScript', exact: true }).click();
      expect(await f.page.getByRole('textbox', { name: 'Browser TypeScript', exact: true }).inputValue())
        .toBe(source.browserTypeScript);
      await f.page.getByRole('status').filter({ hasText: '/assets/files/gone.pdf' }).waitFor();
      expect(await f.page.getByRole('button', { name: 'Save draft', exact: true }).isEnabled()).toBe(true);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('preserves buffers, cursor and selected source tab between sections and warns once before leaving', async() => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/templates/Home');
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<html>Unsaved</html>');
      await f.page.getByRole('button', { name: 'CSS', exact: true }).click();
      const css = f.page.getByRole('textbox', { name: 'CSS', exact: true });

      await css.fill('body { margin: 0; }');
      await css.evaluate((node: HTMLTextAreaElement) => {
        node.setSelectionRange(5, 9);
      });
      await f.page.locator('.site-sections').getByRole('button', { name: 'Chunks', exact: true }).click();
      await f.page.locator('.source-list').getByRole('button', { name: 'Footer', exact: true }).click();
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<footer>Unsaved</footer>');
      await f.page.locator('.site-sections').getByRole('button', { name: 'Templates', exact: true }).click();
      expect(await css.inputValue()).toBe('body { margin: 0; }');
      expect(await css.evaluate((node: HTMLTextAreaElement) => node.selectionStart)).toBe(5);
      let dialogs = 0;

      f.page.on('dialog', async(dialog) => {
        dialogs++;
        await dialog.dismiss();
      });
      await f.page.getByRole('button', { name: 'All sites', exact: true }).click();
      await f.page.waitForURL('**/templates/Home');
      expect(dialogs).toBe(1);
      expect(f.writes).toHaveLength(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('keeps input after conflicts and supports explicit backup repair and preview', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/chunks/Footer');
      await f.page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<footer>Changed</footer>');
      f.state.status = 409;
      await clickDraft(f.page);
      await f.page.getByText(/This element has changed elsewhere/).waitFor();
      expect(await f.page.getByRole('textbox', { name: 'HTML', exact: true }).inputValue()).toContain('Changed');
      f.state.status = 200;
      f.state.pendingBackup = true;
      await clickDraft(f.page);
      await f.page.getByText(/its file backup is incomplete/).waitFor();
      expect(await f.page.getByRole('textbox', { name: 'HTML', exact: true }).isDisabled()).toBe(true);
      f.state.pendingBackup = false;
      await f.page.getByRole('button', { name: 'Retry file backup', exact: true }).click();
      await f.page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
      await f.page.getByLabel('Page for preview', { exact: true }).selectOption('page-1');
      await f.page.getByRole('button', { name: 'Preview', exact: true }).click();
      await f.page.frameLocator('.source-preview iframe').getByText('Compiled preview').waitFor();
      expect(f.writes.filter((item) => item.path.endsWith('/publish'))).toHaveLength(0);
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });

  it('fits shared viewport widths in both languages, with inert inactive panels and touch targets', async () => {
    const f = await fixture();

    try {
      await f.page.goto('http://localhost:31989/admin/sites/site-1/templates/Home');

      for (const language of ['en', 'ru']) {
        await f.page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await f.page.setViewportSize({ width, height: 900 });
          expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          const editor = f.page.locator('.element-editor:visible');

          await editor.waitFor();

          const workspace = f.page.getByRole('main', {
            name: language === 'ru' ? 'Шаблоны' : 'Templates',
            exact: true,
          });
          const bounds = (await workspace.boundingBox())!;

          expect(Math.round(bounds.x)).toBe(width < 992 ? 0 : 286);
          expect(Math.round(bounds.width)).toBe(width < 992 ? width : width - 286);

          if (width < 992) {
            await expect.poll(() => f.page.locator('#source-list-Template').getAttribute('inert')).not.toBeNull();
          }

          const tab = f.page.locator('.site-sections button').first();

          expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);

          for (const button of await f.page.locator('._element-actions button').all()) {
            const action = (await button.boundingBox())!;

            expect(action.height).toBeGreaterThanOrEqual(44);
            expect(action.x).toBeGreaterThanOrEqual(bounds.x);
            expect(action.x + action.width).toBeLessThanOrEqual(bounds.x + bounds.width);
          }
        }
      }
      await f.page.screenshot({ path: '.tmp/source-editor-desktop.png' });
      await f.page.setViewportSize({ width: 390, height: 844 });
      await f.page.screenshot({ path: '.tmp/source-editor-mobile.png' });
      expect(f.errors).toEqual([]);
    } finally {
      await f.context.close();
    }
  });
});
