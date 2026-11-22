import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright-core';
import sharp from 'sharp';

import { chooseLocalSiteOrigin } from '../support/site-onboarding.js';

interface IFixture {
  context: BrowserContext;
  page: Page;
  state: { authenticated: boolean; loginStatus: number; contentStatus: number; publicationStatus: number };
  writes: { route: string; body: unknown }[];
}

describe('built administration languages with isolated HTTP fixtures', () => {
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

  async function fixture(authenticated = false, existing = false): Promise<IFixture> {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const state = { authenticated, loginStatus: 401, contentStatus: 200, publicationStatus: 200 };
    const writes: { route: string; body: unknown }[] = [];
    const adminSession = { user: { authorization: { systemAdmin: true, siteAdminSiteIds: [] } } };
    let hasSite = existing;
    let site = {
      siteId: 'site-1',
      mark: 'Example',
      name: 'Example site',
      primaryDomain: 'example.test',
      languages: ['en', 'ru'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    const draft = {
      pageId: 'page-1',
      siteId: site.siteId,
      mark: 'HomeEn',
      title: 'Original title',
      language: 'en',
      status: 'DRAFT',
      contentMd: '# Original content',
    };
    let savedPage = existing ? draft : null;
    let savedPath: string | null = null;
    let savedTemplate: string | null = null;

    page.setDefaultTimeout(3000);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (url.origin !== 'http://localhost:31987') {
        await route.abort();

        return;
      }
      if (pathname.startsWith('/api/')) {
        if (request.method() === 'POST') {
          writes.push({ route: pathname, body: request.postDataJSON() });
        }
        if (pathname === '/api/admin/auth/me') {
          await route.fulfill({
            status: state.authenticated ? 200 : 401,
            json: state.authenticated ? adminSession : {},
          });
        } else if (pathname === '/api/admin/auth/login') {
          if (state.loginStatus === 200) {
            state.authenticated = true;
          }
          await route.fulfill({
            status: state.loginStatus,
            headers: { 'Retry-After': '120' },
            json: state.loginStatus === 200 ? adminSession : {},
          });
        } else if (state.contentStatus !== 200) {
          await route.fulfill({ status: state.contentStatus, json: { error: 'Conflict' } });
        } else if (pathname.endsWith('/addon-installations')) {
          await route.fulfill({ json: { items: [] } });
        } else if (pathname.endsWith('/files')) {
          await route.fulfill({ json: { version: 'v1', pending: false, files: [], folders: [] } });
        } else if (pathname.endsWith('/template-variables')) {
          const catalog = { siteId: 'site-1', version: 'v1', fields: [] };

          await route.fulfill({
            json: pathname.includes('/pages/')
              ? { catalog, values: {}, mediaVersion: 'v1' } : catalog,
          });
        } else if (pathname.endsWith('/templates') || pathname.endsWith('/chunks')) {
          await route.fulfill({ json: { items: [] } });
        } else if (pathname.endsWith('/json-ld-preview') || pathname.endsWith('/json-ld-published')) {
          await route.fulfill({
            json: { jsonLd: JSON.stringify({ '@context': 'https://schema.org', '@graph': [] }), warnings: [] },
          });
        } else if (pathname.endsWith('/markdown-preview') || pathname.endsWith('/markdown-published')) {
          await route.fulfill({
            json: {
              markdown: pathname.endsWith('/markdown-preview')
                ? '# Saved draft' : '# Published',
            },
          });
        } else if (pathname.endsWith('/publication')) {
          if (request.method() === 'POST') {
            if (state.publicationStatus !== 200) {
              if (state.publicationStatus === 401) {
                state.authenticated = false;
              }
              await route.fulfill({ status: state.publicationStatus, json: { error: 'Conflict' } });
            } else {
              savedPage = { ...(savedPage ?? draft), status: 'PUBLISHED' };
              savedPath = request.postDataJSON().path;
              savedTemplate = request.postDataJSON().templateId;
              await route.fulfill({
                json: {
                  page: savedPage,
                  publication: { siteId: 'site-1', releaseId: 'release' },
                },
              });
            }
          } else {
            await route.fulfill({
              json: {
                templates: [{ templateId: 'ZaryaBasic', requiresParameters: false }],
                pageAvailability: savedPage && savedPath ? [{
                  pageId: savedPage.pageId, assignedPath: savedPath, publicPath: savedPath,
                }] : [],
                templateId: savedTemplate,
                path: savedPath,
              },
            });
          }
        } else if (pathname.endsWith('/publish')) {
          await route.fulfill({ json: { siteId: 'site-1', releaseId: 'site-release' } });
        } else if (pathname === '/api/admin/sites') {
          if (request.method() === 'POST') {
            site = { ...site, ...request.postDataJSON() };
            hasSite = true;
            await route.fulfill({ status: 201, json: site });
          } else {
            await route.fulfill({ json: { items: hasSite ? [site] : [] } });
          }
        } else if (pathname === '/api/admin/sites/site-1/addons' && request.method() === 'GET') {
          await route.fulfill({ json: { items: [] } });
        } else if (pathname === '/api/admin/sites/site-1/settings' && request.method() === 'GET') {
          await route.fulfill({
            json: {
              siteId: site.siteId,
              timeZone: 'UTC',
              addresses: { publicOrigin: null, localOrigin: null },
            },
          });
        } else if (pathname === '/api/admin/sites/site-1/pages') {
          if (request.method() === 'POST') {
            savedPage = { ...draft, ...request.postDataJSON() };
            await route.fulfill({ status: 201, json: savedPage });
          } else {
            await route.fulfill({ json: { items: savedPage ? [savedPage] : [] } });
          }
        } else if (pathname === '/api/admin/sites/site-1/pages/page-1') {
          if (request.method() === 'POST') {
            savedPage = { ...(savedPage ?? draft), ...request.postDataJSON() };
          }
          await route.fulfill({ json: savedPage ?? draft });
        } else {
          throw new Error('Unexpected fixture API: ' + pathname);
        }

        return;
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture asset');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript'
          : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });

    return { context, page, state, writes };
  }

  it('defaults to English with a Russian browser and translates login feedback without losing input', async () => {
    const { context, page, state } = await fixture();

    try {
      await page.goto('http://localhost:31987/admin/');
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      expect(await page.locator('html').getAttribute('lang')).toBe('en');
      expect(await page.getByLabel('Interface language').inputValue()).toBe('en');
      await page.getByLabel('Email', { exact: true }).fill('person@example.test');
      await page.getByLabel('Password', { exact: true }).fill('unchanged draft password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByText('Incorrect email or password.', { exact: true }).waitFor();
      await page.getByLabel('Interface language').selectOption('ru');
      await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();
      expect(await page.locator('html').getAttribute('lang')).toBe('ru');
      expect(await page.getByLabel('Пароль', { exact: true }).inputValue()).toBe('unchanged draft password');
      expect(await page.getByLabel('Email', { exact: true }).inputValue()).toBe('person@example.test');
      expect(await page.getByRole('alert').textContent()).toBe('Неверный email или пароль.');
      state.loginStatus = 429;
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await page.getByText('Слишком много попыток. Попробуйте через 2 мин.', { exact: true }).waitFor();
      await page.getByLabel('Язык интерфейса').selectOption('en');
      await page.getByText('Too many attempts. Try again in 2 min.', { exact: true }).waitFor();
      await page.getByLabel('Interface language').selectOption('ru');
      await page.reload();
      await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();
      expect(await page.getByLabel('Язык интерфейса').inputValue()).toBe('ru');
    } finally {
      await context.close();
    }
  });

  it('restores the site creation draft after reload and clears it only after successful creation', async () => {
    const { context, page } = await fixture(true);
    let reject = true;

    try {
      await page.route('**/api/admin/sites', async (route) => {
        if (route.request().method() === 'POST' && reject) {
          await route.fulfill({ status: 409, json: { error: 'Conflict' } });
        } else {
          await route.fallback();
        }
      });
      await page.goto('http://localhost:31987/admin/sites/new');
      await page.locator('#site-name').fill('Saved project');
      await page.locator('#site-domain').fill('saved.test');
      await page.locator('#site-mark').fill('SavedProject');
      await page.locator('#site-language').fill('ru');
      await page.locator('#site-local-address').fill('http://localhost:3101/');
      await page.locator('#site-origin-public').check();
      await page.reload();
      await page.locator('#site-name').waitFor();
      expect(await page.locator('#site-name').inputValue()).toBe('Saved project');
      expect(await page.locator('#site-domain').inputValue()).toBe('saved.test');
      expect(await page.locator('#site-mark').inputValue()).toBe('SavedProject');
      expect(await page.locator('#site-language').inputValue()).toBe('ru');
      expect(await page.locator('#site-local-address').inputValue()).toBe('http://localhost:3101/');
      expect(await page.locator('#site-origin-public').isChecked()).toBe(true);
      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await page.reload();
      await page.locator('#site-name').waitFor();
      expect(await page.locator('#site-name').inputValue()).toBe('Saved project');
      reject = false;
      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      await page.getByRole('button', { name: 'Create home page', exact: true }).waitFor();
      expect(await page.evaluate(() => localStorage.getItem('zarya.admin.siteCreationDraft'))).toBeNull();
      await page.goto('http://localhost:31987/admin/sites/new');
      await page.locator('#site-name').waitFor();

      for (const id of ['site-name', 'site-domain', 'site-mark', 'site-language']) {
        expect(await page.locator('#' + id).inputValue()).toBe('');
      }
      expect(await page.locator('#site-local-address').inputValue()).toBe('http://localhost:3000/');
      expect(await page.locator('#site-origin-local').isChecked()).toBe(false);
      expect(await page.locator('#site-origin-public').isChecked()).toBe(false);
      expect(await page.evaluate(() => localStorage.getItem('zarya.admin.siteCreationDraft'))).toBeNull();
    } finally {
      await context.close();
    }
  });

  it.each(['malformed', 'blocked'])('keeps site creation usable with %s draft storage', async (storage) => {
    const { context, page } = await fixture(true);

    try {
      await page.addInitScript((mode) => {
        if (mode === 'blocked') {
          Object.defineProperty(window, 'localStorage', {
            get(): never {
              throw new DOMException('Storage blocked', 'SecurityError');
            },
          });
        } else {
          localStorage.setItem('zarya.admin.siteCreationDraft', '{"name":');
        }
      }, storage);
      await page.goto('http://localhost:31987/admin/sites/new');
      await page.locator('#site-name').waitFor();
      expect(await page.locator('#site-name').inputValue()).toBe('');
      expect(await page.locator('#site-local-address').inputValue()).toBe('http://localhost:3000/');
      await page.locator('#site-name').fill('Usable form');
      await page.locator('#site-domain').fill('usable.test');
      await page.locator('#site-mark').fill('UsableForm');
      await page.locator('#site-language').fill('en');
      await page.locator('#site-origin-local').check();
      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      await page.getByRole('button', { name: 'Create home page', exact: true }).waitFor();
    } finally {
      await context.close();
    }
  });

  it('uses the entered site language independently of the interface and preserves the creation form', async () => {
    const { context, page, writes } = await fixture(true);

    try {
      await page.goto('http://localhost:31987/admin/');
      await page.getByRole('heading', { name: 'Create your first site' }).waitFor();
      expect(await page.getByLabel('Default site language').inputValue()).toBe('');
      await page.getByLabel('Default site language').fill('en');
      expect(await page.locator('#site-local-address').inputValue()).toBe('http://localhost:3000/');
      await page.getByLabel('Site name', { exact: true }).fill('Untouched project name');
      await page.getByLabel('Domain', { exact: true }).fill('example.test');
      await page.locator('#site-origin-local').check();
      await page.getByLabel('Site key').fill('Example');
      await page.getByLabel('Interface language').selectOption('ru');
      expect(await page.getByLabel('Основной язык сайта').inputValue()).toBe('en');
      expect(await page.getByLabel('Название сайта').inputValue()).toBe('Untouched project name');
      await page.getByRole('button', { name: 'Создать сайт', exact: true }).click();
      await page.getByRole('button', { name: 'Создать главную страницу' }).waitFor();
      expect(writes).toEqual([{
        route: '/api/admin/sites',
        body: {
          name: 'Untouched project name',
          mark: 'Example',
          primaryDomain: 'example.test',
          languages: ['en'],
          defaultLanguage: 'en',
          onboarding: { localAddress: 'http://localhost:3000/', originMode: 'Local' },
        },
      }]);
      await page.getByRole('button', { name: 'Создать главную страницу' }).click();
      expect(await page.getByLabel('Название страницы').inputValue()).toBe('Home');
      expect(await page.getByLabel('Язык страницы').inputValue()).toBe('en');
      await page.getByLabel('Содержимое', { exact: true }).fill('# Keep this content');
      await page.getByLabel('Язык интерфейса').selectOption('en');
      expect(await page.getByLabel('Content', { exact: true }).inputValue()).toBe('# Keep this content');
      expect(await page.getByLabel('Page title').inputValue()).toBe('Home');
      await page.getByRole('button', { name: 'Save draft' }).click();
      await page.getByText('Draft saved', { exact: true }).first().waitFor();
      expect(writes[1]?.body).toMatchObject({ title: 'Home', language: 'en', contentMd: '# Keep this content' });
    } finally {
      await context.close();
    }
  });

  it('checks the occupied local address on submission and preserves the form for correction', async () => {
    const { context, page } = await fixture(true);
    let attempts = 0;

    try {
      await page.route('**/api/admin/sites', async (route) => {
        if (route.request().method() === 'POST' && ++attempts === 1) {
          await route.fulfill({ status: 409, json: { error: 'Conflict', field: 'onboarding.localAddress' } });
        } else {
          await route.fallback();
        }
      });
      await page.goto('http://localhost:31987/admin/sites/new');
      await page.getByLabel('Site name', { exact: true }).fill('Port test');
      await page.getByLabel('Domain', { exact: true }).fill('port-test.example');
      await page.getByLabel('Site key', { exact: true }).fill('PortTest');
      await page.locator('#site-language').fill('en');
      await page.locator('#site-origin-local').check();
      expect(attempts).toBe(0);
      const response = page.waitForResponse((result) => result.request().method() === 'POST');

      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      await response;
      expect(await page.locator('#site-local-address').getAttribute('aria-invalid')).toBe('true');
      expect(await page.locator('#site-local-error').textContent()).toContain('already belongs to another site');
      expect(await page.getByLabel('Site name', { exact: true }).inputValue()).toBe('Port test');
      await page.getByLabel('Interface language').selectOption('ru');
      expect(await page.locator('#site-local-error').textContent()).toContain('уже назначен другому сайту');
      await page.locator('#site-local-address').fill('http://localhost:3001/');
      expect(await page.locator('#site-local-address').getAttribute('aria-invalid')).toBe('false');
      await page.getByRole('button', { name: 'Создать сайт', exact: true }).click();
      await page.getByRole('button', { name: 'Создать главную страницу' }).waitFor();
      expect(attempts).toBe(2);
    } finally {
      await context.close();
    }
  });

  it('preserves page language/text and translates errors, offering all configured site languages', async () => {
    const { context, page, state, writes } = await fixture(true, true);

    try {
      await page.goto('http://localhost:31987/admin/sites');
      await page.getByRole('button', { name: /Example site/ }).click();
      await page.getByRole('treeitem', { name: /Original title/ }).click();
      await page.getByLabel('Page title').fill('Unsaved title');
      await page.getByLabel('Content', { exact: true }).fill('# Unsaved content');
      state.contentStatus = 409;
      await page.getByRole('button', { name: 'Save draft' }).click();
      await page.getByRole('alert').waitFor();
      expect(await page.getByRole('alert').textContent()).toContain('already in use');
      await page.getByLabel('Interface language').selectOption('ru');
      expect(await page.getByRole('alert').textContent()).toContain('уже занят');
      expect(await page.getByLabel('Название страницы').inputValue()).toBe('Unsaved title');
      expect(await page.getByLabel('Содержимое', { exact: true }).inputValue()).toBe('# Unsaved content');
      expect(await page.getByLabel('Язык страницы').inputValue()).toBe('en');
      expect(writes).toHaveLength(1);
      state.contentStatus = 200;
      await page.getByRole('button', { name: 'Создать страницу', exact: true }).click();
      await page.getByLabel('Язык страницы').selectOption('ru');
      await page.getByLabel('Название страницы').fill('Русская страница');
      await page.getByRole('button', { name: 'Сохранить черновик' }).click();
      await page.getByText('Черновик сохранён', { exact: true }).first().waitFor();
      expect(writes[1]?.body).toMatchObject({ language: 'ru', title: 'Русская страница' });
    } finally {
      await context.close();
    }
  });

  it('fits both languages at shared viewport widths and keeps the selector in the top right', async () => {
    const { context, page } = await fixture(true, true);

    try {
      await page.goto('http://localhost:31987/admin/sites');
      await page.getByRole('button', { name: /Example site/ }).click();

      for (const language of ['en', 'ru']) {
        await page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          const selector = await page.locator('.admin-language select').boundingBox();

          expect(selector?.y).toBeLessThan(68);
          expect((selector?.x ?? 0) + (selector?.width ?? 0)).toBeLessThanOrEqual(width);
          expect(selector?.x).toBeGreaterThan(width / 2);
        }
      }
      await page.screenshot({ path: '.tmp/admin-i18n-desktop.png' });
      await page.setViewportSize({ width: 320, height: 844 });
      await page.screenshot({ path: '.tmp/admin-i18n-mobile.png' });
      await page.getByRole('button', { name: 'Все сайты', exact: true }).click();
      await page.getByRole('button', { name: 'Создать сайт', exact: true }).click();
      await page.screenshot({ path: '.tmp/admin-i18n-site-mobile.png' });
    } finally {
      await context.close();
    }
  });

  it('preserves an unsaved page when navigating between site sections in either interface language', async () => {
    const { context, page, writes } = await fixture(true, true);

    try {
      for (const language of ['en', 'ru']) {
        for (const width of [320, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
          await page.locator('.admin-language select').selectOption(language);
          await page.locator('#page-title').fill('Unsaved title');
          await page.locator('#page-content').fill('# Unsaved content');
          await page.locator('#page-template').selectOption('ZaryaBasic');
          await page.locator('#page-path').fill('/unsaved/');
          const navigation = page.getByRole('navigation');

          await navigation.getByRole('button').nth(1).click();
          await page.waitForURL('**/templates');
          await navigation.getByRole('button').nth(2).click();
          await page.waitForURL('**/chunks');
          await navigation.getByRole('button').first().click();
          await page.waitForURL('**/pages/page-1');
          expect(await page.locator('#page-title').inputValue()).toBe('Unsaved title');
          expect(await page.locator('#page-content').inputValue()).toBe('# Unsaved content');
          expect(await page.locator('#page-template').inputValue()).toBe('ZaryaBasic');
          expect(await page.locator('#page-path').inputValue()).toBe('/unsaved/');
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
      }
      expect(writes).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
  it('opens JSON-LD actions without moving the fixed toolbar or losing unsaved fields', async () => {
    const { context, page, writes } = await fixture(true, true);

    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await page.locator('#page-title').fill('Unsaved title');

      for (const language of ['en', 'ru']) {
        await page.locator('.admin-language select').selectOption(language);
        const draftTitle = language === 'ru' ? 'JSON-LD сохранённого черновика' : 'Saved draft JSON-LD';
        const trigger = page.locator('.json-ld-actions').getByText('JSON-LD', { exact: true });

        for (const width of [320, 768, 992, 1200, 1440]) {
          await page.setViewportSize({ width, height: 960 });
          await trigger.scrollIntoViewIfNeeded();
          await page.evaluate(() => document.fonts.ready);
          const geometry = async (): Promise<unknown> => page.locator('.page-editor-frame').evaluate((element) => {
            const selectors = ['.page-editor-controls', '.page-actions', '.page-actions .cms-primary',
              '.page-actions .markdown-actions', '._workspace-scroll'];

            return selectors.map(selector => {
              const box = element.querySelector(selector)!.getBoundingClientRect();

              return { x: box.x, y: box.y, width: box.width, height: box.height };
            });
          });
          const before = await geometry();
          const rows = await page.locator('._page-controls-inner button:visible').evaluateAll(buttons =>
            new Set(buttons.map(button => Math.round(button.getBoundingClientRect().y))).size);

          if (width === 1440) {
            expect(rows, language + ' actions fit one row at desktop width').toBe(1);
          } else if (width === 768) {
            expect(rows, language + ' actions wrap when space is insufficient').toBeGreaterThan(1);
          }

          await trigger.click();
          await page.getByRole('button', { name: draftTitle, exact: true }).waitFor();
          expect(await geometry(), language + ' toolbar remains fixed at ' + width).toEqual(before);
          const popup = page.locator('.json-ld-popup');
          const bounds = (await popup.boundingBox())!;

          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(960);

          if (language === 'ru' && process.env.ZARYA_UI_SCREENSHOT_DIRECTORY && [320, 768, 1440].includes(width)) {
            await page.screenshot({
              path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-toolbar-' + width + '.png'),
            });
          }
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: draftTitle, exact: true }).waitFor({ state: 'hidden' });
          expect(await trigger.evaluate(element => document.activeElement === element)).toBe(true);
          expect(await page.getByRole('button', { name: draftTitle, exact: true }).isVisible()).toBe(false);
          await trigger.click();
          await page.locator('.page-editor-controls ._workspace-title').click();
          await page.getByRole('button', { name: draftTitle, exact: true }).waitFor({ state: 'hidden' });
          expect(await page.getByRole('button', { name: draftTitle, exact: true }).isVisible()).toBe(false);
          expect(await page.locator('#page-title').inputValue()).toBe('Unsaved title');
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await trigger.click();
        expect(await page.getByRole('button', {
          name: language === 'ru' ? 'Опубликованный JSON-LD' : 'Published JSON-LD', exact: true,
        }).isDisabled()).toBe(true);
        await page.getByRole('button', { name: draftTitle, exact: true }).click();
        const preview = page.getByRole('dialog');

        await preview.getByRole('heading', { name: draftTitle, exact: true }).waitFor();
        expect(await preview.locator('pre').textContent()).toContain('https://schema.org');
        await preview.getByRole('button', { name: language === 'ru' ? 'Отмена' : 'Cancel', exact: true }).click();
        expect(await page.locator('#page-title').inputValue()).toBe('Unsaved title');
      }
      expect(writes).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  it('views saved Markdown without saving or discarding editor changes', async () => {
    const { context, page, writes } = await fixture(true, true);

    try {
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await page.locator('#page-title').fill('Unsaved title');
      expect(await page.getByRole('button', { name: 'View in MD' }).isDisabled()).toBe(true);
      const more = page.getByRole('button', { name: 'More Markdown options' });

      await more.click();
      await page.getByRole('menuitem', { name: 'View draft in MD' }).click();
      const dialog = page.getByRole('dialog');

      await dialog.getByText('Saved draft Markdown').waitFor();
      expect(await dialog.locator('pre').textContent()).toBe('# Saved draft');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      expect(await page.locator('#page-title').inputValue()).toBe('Unsaved title');
      expect(writes).toHaveLength(0);
      await more.click();
      await page.keyboard.press('Escape');
      expect(await more.evaluate((element) => document.activeElement === element)).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('keeps the primary action at the right of the fixed action bar and publishes only after saving', async () => {
    const { context, page, writes } = await fixture(true, true);

    try {
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await page.getByLabel('Template', { exact: true }).selectOption('ZaryaBasic');
      await page.getByLabel('Public URL path').fill('/example/');
      await page.getByLabel('Page title').fill('Published title');
      const buttons = page.locator('.page-actions button:visible');

      expect((await buttons.allTextContents()).map(text => text.trim()))
        .toEqual(['JSON-LD', 'View in MD', '▾', 'Cancel', 'Save draft', 'Save & publish']);
      expect(await buttons.last().getAttribute('class')).toBe('cms-primary');
      expect(await buttons.nth(2).getAttribute('class')).toBe('cms-secondary');

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        await buttons.last().scrollIntoViewIfNeeded();
        const primary = await buttons.last().boundingBox();
        const actions = await page.locator('._page-controls-inner').boundingBox();

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(Math.abs((primary!.x + primary!.width) - (actions!.x + actions!.width))).toBeLessThanOrEqual(1);
        expect(Math.abs((primary!.y + primary!.height) - (actions!.y + actions!.height))).toBeLessThanOrEqual(1);
        expect(primary!.y + primary!.height).toBeLessThanOrEqual(960);
        expect(await page.locator('.page-actions').evaluate((element) =>
          element.closest('._workspace-scroll') === null)).toBe(true);
      }
      await page.screenshot({ path: '.tmp/admin-page-actions.png' });
      await buttons.last().click();
      await page.getByText('Page published', { exact: true }).waitFor();
      expect(writes.map((entry) => entry.route)).toEqual([
        '/api/admin/sites/site-1/pages/page-1', '/api/admin/sites/site-1/pages/page-1/publication',
      ]);
      expect(writes[1]?.body).toEqual({ templateId: 'ZaryaBasic', path: '/example/' });
      await page.reload();
      await expect.poll(() => page.getByLabel('Public URL path').inputValue()).toBe('/example/');
      expect(await page.getByLabel('Public URL path').getAttribute('readonly')).not.toBeNull();
      await page.getByRole('button', { name: 'View in MD', exact: true }).click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Published Markdown', exact: true }).waitFor();
      expect(await page.getByRole('dialog').locator('pre').innerText()).toBe('# Published');
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.locator('.page-actions').getByRole('button', { name: 'JSON-LD', exact: true }).click();
      await page.getByRole('button', { name: 'Published JSON-LD', exact: true }).click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Published JSON-LD', exact: true }).waitFor();
      expect(await page.getByRole('dialog').locator('pre').textContent()).toContain('https://schema.org');
      expect(writes).toHaveLength(2);
    } finally {
      await context.close();
    }
  });

  it('starts a fresh form after saving a new page without restoring its completed buffer', async () => {
    const { context, page } = await fixture(true, true);

    try {
      await page.clock.install();
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/new');
      const originalMark = await page.getByLabel('Page key', { exact: true }).inputValue();

      await page.getByLabel('Page title', { exact: true }).fill('Completed page');
      await page.getByLabel('Content', { exact: true }).fill('Completed content');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText('Draft saved', { exact: true }).waitFor();
      await page.clock.runFor(1100);
      await page.waitForURL('**/sites/site-1');
      await page.getByRole('button', { name: 'Create page', exact: true }).click();
      expect(await page.getByLabel('Page title', { exact: true }).inputValue()).toBe('');
      expect(await page.getByLabel('Content', { exact: true }).inputValue()).toBe('');
      expect(await page.getByLabel('Page key', { exact: true }).inputValue()).not.toBe(originalMark);
    } finally {
      await context.close();
    }
  });

  it('retains settings and saved identity after a failed publication without duplicating pages', async () => {
    const { context, page, state, writes } = await fixture(true, true);

    try {
      await page.clock.install();
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/new');
      await page.getByLabel('Page title').fill('New page');
      await page.getByLabel('Template', { exact: true }).selectOption('ZaryaBasic');
      await page.getByLabel('Public URL path').fill('/new/');
      state.publicationStatus = 409;
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByRole('alert').waitFor();
      expect(await page.getByRole('alert').textContent()).toContain('Draft saved');
      expect(await page.getByLabel('Public URL path').inputValue()).toBe('/new/');
      expect(await page.getByLabel('Template', { exact: true }).inputValue()).toBe('ZaryaBasic');
      expect(await page.getByText('Page published', { exact: true }).count()).toBe(0);
      await page.clock.runFor(2000);
      expect(page.url()).toContain('/pages/page-1');
      expect(await page.locator('.page-saving-overlay').count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Save & publish', exact: true }).isEnabled()).toBe(true);
      await page.locator('.site-sections button').nth(1).click();
      await page.locator('.site-sections button').first().click();
      expect(page.url()).toContain('/pages/page-1');
      state.publicationStatus = 200;
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByText('Page published', { exact: true }).waitFor();
      expect(writes.filter((entry) => entry.route === '/api/admin/sites/site-1/pages')).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

  it('keeps unsaved page edits when sign-out confirmation is cancelled', async () => {
    const { context, page } = await fixture(true, true);
    let logoutRequests = 0;

    try {
      await page.route('**/api/admin/auth/logout', async (route) => {
        logoutRequests++;
        await route.fulfill({ status: 503 });
      });
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await page.getByLabel('Page title').fill('Unsaved page title');
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        await dialog.dismiss();
      });
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();

      expect(logoutRequests).toBe(0);
      expect(page.url()).toContain('/pages/page-1');
      expect(await page.getByLabel('Page title').inputValue()).toBe('Unsaved page title');
    } finally {
      await context.close();
    }
  });

  it.each(['Save draft', 'Save & publish'])('blocks %s, then closes the editor after one second', async (action) => {
    const { context, page } = await fixture(true, true);
    let releaseSave!: () => void;
    const saving = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });

    try {
      await page.clock.install();
      await page.route('**/api/admin/sites/site-1/pages/page-1', async (route) => {
        if (route.request().method() === 'POST') {
          await saving;
        }
        await route.fallback();
      });
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await page.getByLabel('Template', { exact: true }).selectOption('ZaryaBasic');
      await page.getByLabel('Public URL path').fill('/example/');
      await page.getByRole('button', { name: action, exact: true }).click();
      await page.locator('.page-saving-overlay').waitFor();
      expect(await page.locator('.page-actions button:enabled').count()).toBe(0);
      expect(await page.getByLabel('Page title').isDisabled()).toBe(true);
      expect(await page.getByRole('button', { name: 'All sites', exact: true }).isDisabled()).toBe(true);
      const overlay = await page.locator('.page-saving-overlay').boundingBox();
      const workspace = await page.locator('#page-workspace').boundingBox();

      expect(overlay).toEqual(workspace);
      await page.screenshot({ path: '.tmp/admin-page-saving.png' });
      releaseSave();
      const message = action === 'Save draft' ? 'Draft saved' : 'Page published';

      await page.getByText(message, { exact: true }).waitFor();
      expect(await page.locator('.page-saving-overlay').count()).toBe(0);
      expect(await page.locator('.page-actions button:enabled').count()).toBe(0);
      await page.clock.runFor(999);
      expect(page.url()).toContain('/pages/page-1');
      await page.clock.runFor(1);
      await page.waitForURL('**/admin/sites/site-1');
      await page.getByRole('heading', { name: 'Select a page', exact: true }).waitFor();
      expect(await page.locator('.page-editor').count()).toBe(0);
      expect(await page.getByText(message, { exact: true }).count()).toBe(0);
    } finally {
      releaseSave();
      await context.close();
    }
  });

  it('stays on login when the session expires between saving and publishing', async () => {
    const { context, page, state } = await fixture(true, true);

    try {
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/new');
      await page.getByLabel('Page title').fill('Expired session');
      await page.getByLabel('Template', { exact: true }).selectOption('ZaryaBasic');
      await page.getByLabel('Public URL path').fill('/expired/');
      state.publicationStatus = 401;
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      expect(page.url()).toBe('http://localhost:31987/admin/login');
    } finally {
      await context.close();
    }
  });

  it('opens the last site after login and preserves site/page addresses through reload and history', async () => {
    const { context, page, state, writes } = await fixture(false, true);

    try {
      await context.addCookies([{ name: 'zarya_admin_site', value: 'site-1', domain: 'localhost', path: '/admin' }]);
      await page.goto('http://localhost:31987/admin/');
      await page.getByLabel('Email', { exact: true }).fill('person@example.test');
      await page.getByLabel('Password', { exact: true }).fill('synthetic password');
      state.loginStatus = 200;
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/admin/sites/site-1');
      await page.getByRole('treeitem', { name: /Original title/ }).waitFor();
      await page.getByRole('button', { name: 'All sites', exact: true }).click();
      await page.waitForURL('**/admin/sites');
      await page.getByRole('heading', { name: 'Sites', exact: true }).waitFor();
      await page.goBack();
      await page.waitForURL('**/admin/sites/site-1');
      await page.getByRole('treeitem', { name: /Original title/ }).click();
      await page.waitForURL('**/admin/sites/site-1/pages/page-1');
      await page.reload();
      expect(await page.getByLabel('Content', { exact: true }).inputValue()).toBe('# Original content');
      await page.getByLabel('Content', { exact: true }).fill('Unsaved change');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForURL('**/admin/sites/site-1');
      expect(writes).toHaveLength(1);
      expect((await context.cookies()).find((cookie) => cookie.name === 'zarya_admin_site')?.value).toBe('site-1');
    } finally {
      await context.close();
    }
  });

  it('does not trust a missing site in a cookie or explicit deep link', async () => {
    const { context, page } = await fixture(true, true);

    try {
      await context.addCookies([{ name: 'zarya_admin_site', value: 'foreign', domain: 'localhost', path: '/admin' }]);
      await page.goto('http://localhost:31987/admin/');
      await page.waitForURL('**/admin/sites/site-1');
      await page.goto('http://localhost:31987/admin/sites/foreign');
      await page.getByRole('alert').waitFor();
      expect(await page.getByRole('alert').textContent()).toContain('unavailable');
      expect(await page.locator('#page-drawer').count()).toBe(0);
    } finally {
      await context.close();
    }
  });

  it('prefills an unassigned page from its parent URL without publishing the parent prefix', async () => {
    const { context, page, writes } = await fixture(true, true);
    let parentPath: string | null = '/pagination-demo';
    const child = {
      pageId: 'page-1',
      siteId: 'site-1',
      mark: 'Child',
      title: 'Child',
      contentMd: 'Saved child',
      language: 'en',
      status: 'PUBLISHED',
      parentPageId: 'parent-1',
      sortOrder: 100,
    };
    const parent = { ...child, pageId: 'parent-1', mark: 'Parent', title: 'Parent', parentPageId: null };

    try {
      await page.route('**/api/admin/sites/site-1/pages', (route) => route.fulfill({
        json: { items: [parent, child] },
      }));
      await page.route('**/api/admin/sites/site-1/pages/page-1', (route) => route.fulfill({ json: child }));
      await page.route(/\/api\/admin\/sites\/site-1\/(?:pages\/page-1\/)?publication$/, (route) => {
        const scoped = new URL(route.request().url()).pathname.includes('/pages/');

        return route.fulfill({
          json: {
            templates: [{ templateId: 'ZaryaBasic', requiresParameters: false }],
            templateId: 'ZaryaBasic',
            path: null,
            pageAvailability: scoped ? [{ pageId: child.pageId, assignedPath: null, publicPath: null }]
              : parentPath ? [{ pageId: parent.pageId, assignedPath: parentPath, publicPath: parentPath }] : [],
          },
        });
      });
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await expect.poll(() => page.locator('#page-path').inputValue()).toBe('/pagination-demo/');
      expect(await page.locator('#path-hint').innerText()).toContain('parent page URL (/pagination-demo/)');
      expect(await page.locator('#path-unassigned').innerText()).toContain('not published on the site');
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByText('Choose a template and a public URL path before publishing.', { exact: true }).waitFor();
      expect(writes).toEqual([]);
      await page.locator('.admin-language select').selectOption('ru');
      expect(await page.locator('#path-hint').innerText()).toContain('URL страницы-родителя (/pagination-demo/)');
      parentPath = null;
      await page.reload();
      await expect.poll(() => page.locator('#page-path').inputValue()).toBe('/');
      expect(await page.locator('#path-hint').innerText()).not.toContain('URL страницы-родителя');
    } finally {
      await context.close();
    }
  });

  it('centers the visible plus in the create-home-page button', async () => {
    const { context, page } = await fixture(true);

    try {
      await page.goto('http://localhost:31987/admin/');
      await page.getByLabel('Site name', { exact: true }).fill('Example');
      await page.getByLabel('Domain', { exact: true }).fill('example.test');
      await chooseLocalSiteOrigin(page);
      await page.getByLabel('Site key').fill('Example');
      await page.locator('#site-language').fill('en');
      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      const button = page.getByRole('button', { name: 'Create home page', exact: true });

      await button.waitFor();

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 844 });
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
        const centerX = (Math.min(...ink.map((pixel) => pixel.x)) + Math.max(...ink.map((pixel) => pixel.x)) + 1) / 2;
        const centerY = (Math.min(...ink.map((pixel) => pixel.y)) + Math.max(...ink.map((pixel) => pixel.y)) + 1) / 2;

        expect(Math.abs(centerX - info.width / 2)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(centerY - info.height / 2)).toBeLessThanOrEqual(0.5);
      }
      await button.screenshot({ path: '.tmp/create-home-button.png' });
      await button.click();
      await page.getByRole('heading', { name: 'Create the home page' }).waitFor();
    } finally {
      await context.close();
    }
  });

  it.each([1, 80])('keeps Pages and create aligned with the tree containing %i pages', async (pageCount) => {
    const { context, page } = await fixture(true, true);

    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('**/api/admin/sites/site-1/pages', async (route) => {
        await route.fulfill({
          json: {
            items: Array.from({ length: pageCount }, (_, index) => ({
              pageId: 'page-' + (index + 1),
              siteId: 'site-1',
              mark: 'Page' + (index + 1),
              title: 'A long page title that must wrap inside the drawer ' + (index + 1),
              language: 'en',
              status: 'DRAFT',
            })),
          },
        });
      });
      await page.goto('http://localhost:31987/admin/sites/site-1');
      await page.getByRole('treeitem').first().waitFor();

      for (const language of ['en', 'ru']) {
        await page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          const heading = page.locator('#page-drawer ._drawer-heading');
          const add = heading.locator('.cms-square');

          expect(await add.count()).toBe(1);
          const titleBox = (await heading.locator('h2').boundingBox())!;
          const addBox = (await add.boundingBox())!;
          const headerBox = (await heading.boundingBox())!;
          const footerBox = await page.locator('#page-drawer ._drawer-footer').boundingBox();
          const drawerBox = (await page.locator('#page-drawer').boundingBox())!;
          const scroll = page.locator('#page-drawer ._tree-scroll');
          const cardBox = (await page.getByRole('treeitem').first().boundingBox())!;

          expect(Math.abs(titleBox.x - cardBox.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(addBox.x + addBox.width - cardBox.x - cardBox.width)).toBeLessThanOrEqual(1);
          expect(Math.abs(titleBox.y + titleBox.height / 2 - addBox.y - addBox.height / 2)).toBeLessThanOrEqual(1);
          expect(addBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
          expect(addBox.width).toBe(44);
          expect(addBox.x + addBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(pageCount > 1);

          if (pageCount === 1) {
            expect(await heading.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');

            continue;
          }
          await scroll.evaluate((element) => {
            element.scrollTop = 240;
          });
          await page.waitForFunction(() => {
            const heading = document.querySelector('#page-drawer ._drawer-heading');

            return heading && getComputedStyle(heading).boxShadow !== 'none';
          });
          expect(await heading.boundingBox()).toEqual(headerBox);
          expect(await add.boundingBox()).toEqual(addBox);
          expect(await page.locator('#page-drawer ._drawer-footer').boundingBox()).toEqual(footerBox);
          expect(await heading.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
          const first = (await page.getByRole('treeitem').first().boundingBox())!;

          expect(first.y).toBeLessThan(headerBox.y + headerBox.height);
          await scroll.evaluate((element) => {
            element.scrollTop = 0;
          });
          await page.waitForFunction(() => {
            const heading = document.querySelector('#page-drawer ._drawer-heading');

            return heading && getComputedStyle(heading).boxShadow === 'none';
          });
          expect(await heading.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
        }
      }
      await page.locator('#page-drawer ._tree-scroll').evaluate((element) => {
        element.scrollTop = 240;
      });
      await page.locator('#page-drawer').screenshot({ path: '.tmp/admin-tree-' + pageCount + '.png' });
      await page.locator('#page-drawer ._drawer-heading .cms-square').click();
      await page.waitForURL('**/admin/sites/site-1/pages/new');
    } finally {
      await context.close();
    }
  });

  it('centers every select arrow with the same right inset in both interface languages', async () => {
    const { context, page } = await fixture(true, true);

    try {
      await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
      await page.getByLabel('Template', { exact: true }).selectOption('ZaryaBasic');

      for (const language of ['en', 'ru']) {
        await page.locator('.admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

          for (const select of await page.locator('select:visible').all()) {
            const screenshot = await select.screenshot();
            const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
            const ink: { x: number; y: number }[] = [];

            for (let y = 4; y < info.height - 4; y++) {
              for (let x = info.width - 36; x < info.width - 3; x++) {
                const offset = (y * info.width + x) * info.channels;

                if (data[offset]! < 190 && data[offset + 1]! < 200 && data[offset + 2]! < 190) {
                  ink.push({ x, y });
                }
              }
            }
            expect(ink.length, language + '/' + width + '/' + await select.getAttribute('id')).toBeGreaterThan(0);
            const top = Math.min(...ink.map((pixel) => pixel.y));
            const bottom = Math.max(...ink.map((pixel) => pixel.y));
            const right = Math.max(...ink.map((pixel) => pixel.x));

            expect(Math.abs((top + bottom + 1) / 2 - info.height / 2)).toBeLessThanOrEqual(1);
            expect(info.width - right - 1).toBeGreaterThanOrEqual(14);
            expect(info.width - right - 1).toBeLessThanOrEqual(18);
          }
        }
      }
      await page.getByLabel('Шаблон', { exact: true }).screenshot({ path: '.tmp/admin-select-template.png' });
    } finally {
      await context.close();
    }
  }, 30000);

  it('uses English for unknown preferences and still switches when storage is unavailable', async () => {
    const { context, page } = await fixture();

    try {
      await page.addInitScript(() => localStorage.setItem('zarya.admin.language', 'de'));
      await page.goto('http://localhost:31987/admin/');
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
        get(): never {
          throw new Error('Storage unavailable');
        },
      }));
      await page.reload();
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await page.getByLabel('Interface language').selectOption('ru');
      await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor();
      expect(await page.locator('html').getAttribute('lang')).toBe('ru');
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: '.tmp/admin-i18n-login-mobile.png' });
    } finally {
      await context.close();
    }
  });
});
