import type { Page } from 'playwright-core';
import sharp from 'sharp';

import { adminJourney } from '../support/admin-journey.js';
import { icoFixture } from '../support/favicon.js';

async function saveSource(page: Page, section: string): Promise<string> {
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.waitForURL(new RegExp('/' + section + '/[0-9]+$'));
  await page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();

  return page.url().split('/').at(-1)!;
}

it('builds a fresh site through the real administration and retains favicon, media, SEO and routes', async () => {
  const f = await adminJourney();
  const { page, origin } = f;
  let failed = true;

  try {
    await page.locator('#site-name').fill('Release journey');
    await page.locator('#site-domain').fill('journey.example.test');
    await page.locator('#site-local-address').fill(origin);
    await page.locator('#site-origin-local').check();
    await page.locator('#site-mark').fill('ReleaseJourney');
    await page.locator('#site-language').fill('en');
    await page.getByRole('button', { name: 'Create site', exact: true }).click();
    await page.waitForURL(/\/admin\/sites\/[a-f0-9-]{36}$/);
    const site = new URL(page.url()).pathname;
    const visit = async (section: string): Promise<void> => {
      await page.goto(origin + site + '/' + section);
    };

    // The initial administrator is the only fixture; all site content is authored in the UI.
    await page.getByRole('button', { name: 'Create home page', exact: true }).click();
    await page.locator('#page-title').fill('Home');
    await page.locator('#page-content').fill('Welcome to the first page.');
    await page.locator('#page-path').fill('/');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved', { exact: true }).waitFor();
    await page.waitForURL(origin + site);
    await page.getByRole('treeitem', { name: /^Home/ }).click();
    const homeEditor = page.url();

    await page.locator('#page-template').selectOption('ZaryaBasic');
    await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
    await page.getByText('Page published', { exact: true }).waitFor();
    const first = await fetch(origin + '/');

    expect(first.status).toBe(200);
    expect(await first.text()).toContain('Welcome to the first page.');

    await page.waitForURL(origin + site);
    await visit('settings');
    const [iconSaved] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/favicon') && response.request().method() === 'POST'),
      page.locator('input[type=file][accept=".ico"]').setInputFiles({
        name: 'favicon.ico', mimeType: 'image/x-icon', buffer: await icoFixture(),
      }),
    ]);

    expect(iconSaved.status()).toBe(200);
    await page.locator('#site-public-origin').fill(origin);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByText('Site address settings saved.', { exact: true }).waitFor();

    await visit('templates');
    await page.getByRole('button', { name: 'Create element', exact: true }).click();
    await page.getByLabel('Element name', { exact: true }).fill('Journey layout');
    const initialHtml = '<!doctype html><html lang="en"><head><title>[[*seo.title]]</title></head>'
      + '<body><header>Journey header</header><h1>[[*seo.heading]]</h1>[[*contentMd:markdown]]</body></html>';

    await page.getByRole('textbox', { name: 'HTML', exact: true }).fill(initialHtml);
    const template = await saveSource(page, 'templates');

    await visit('chunks');
    await page.getByRole('button', { name: 'Create element', exact: true }).click();
    await page.getByLabel('Element name', { exact: true }).fill('Journey header');
    await page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<header>Journey header extracted</header>');
    const header = await saveSource(page, 'chunks');
    // Text result contracts keep these small editable examples independent of business add-ons.
    const snippets: string[] = [];

    for (const [name, code] of [
      ['Journey breadcrumbs', 'return context.pageId ? "Home / Article" : "Home";'],
      ['Journey pagination', 'return "Page 1 of " + Math.max(1, Math.ceil(context.publishedPages.length / 2));'],
    ]) {
      await visit('snippets');
      await page.getByRole('button', { name: 'Create element', exact: true }).click();
      await page.getByLabel('Element name', { exact: true }).fill(name!);
      await page.getByRole('textbox', { name: 'Server TypeScript', exact: true }).fill(code!);
      await page.getByRole('button', { name: 'Result contract', exact: true }).click();
      await page.getByLabel('Type', { exact: true }).selectOption('String');
      snippets.push(await saveSource(page, 'snippets'));
    }

    await visit('files');
    const pixels = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#28634f' } })
      .png().toBuffer();

    for (const [name, mode] of [['original.png', 'Original'], ['responsive.png', 'Responsive']]) {
      await page.locator('.file-upload input[type=file]').setInputFiles({
        name: name!, mimeType: 'image/png', buffer: pixels,
      });
      await page.getByRole('combobox', { name: /^Processing/ }).selectOption(mode!);
      await page.getByRole('button', { name: 'Upload images', exact: true }).click();
      await page.getByRole('button', { name: name!, exact: true }).waitFor();
    }
    await page.getByRole('button', { name: 'original.png', exact: true }).click();
    await page.getByRole('button', { name: 'Copy img', exact: true }).click();
    const originalMarkup = await page.locator('.file-code textarea').inputValue();

    expect(originalMarkup).toContain('original.png');
    expect(originalMarkup).not.toContain('srcset');
    await visit('files');
    await page.getByRole('button', { name: 'responsive.png', exact: true }).click();
    await page.getByRole('button', { name: 'Copy picture', exact: true }).click();
    const responsiveMarkup = await page.locator('.file-code textarea').inputValue();

    expect(responsiveMarkup).toContain('<picture>');
    expect(responsiveMarkup).toContain('srcset');

    await visit('template-variables');

    for (const [technical, caption] of [['hero', 'Hero image'], ['fixedImage', 'Fixed image']]) {
      await page.getByRole('button', { name: 'Create TV', exact: true }).click();
      await page.getByLabel('Technical name', { exact: true }).fill(technical!);
      await page.getByLabel('Caption', { exact: true }).fill(caption!);
      await page.getByLabel('Type', { exact: true }).selectOption('Image');
      await page.getByLabel('Journey layout', { exact: true }).check();
      await page.getByRole('button', { name: 'Save TV fields', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'TV fields saved' }).waitFor();
    }

    await visit('templates/' + template);
    await page.getByRole('textbox', { name: 'HTML', exact: true }).fill(
      '<!doctype html><html lang="en"><head><title>[[*seo.title]]</title>'
      + '<meta name="description" content="[[*seo.description]]"><meta name="robots" content="[[*seo.robots]]">'
      + '<meta property="og:title" content="[[*seo.ogTitle]]">'
      + '<meta property="og:description" content="[[*seo.ogDescription]]">'
      + '<meta property="og:image" content="[[*seo.ogImage]]"></head><body>'
      + '[[$' + header + ']]'
      + '[[' + snippets[0] + '? &as=`crumbs`]]<nav data-crumbs>[[+crumbs]]</nav>'
      + '[[' + snippets[1] + '? &as=`pager`]]<nav data-pager>[[+pager]]</nav>'
      + '<h1>[[*seo.heading]]</h1>[[*contentMd:markdown]]'
      + '<img data-hero width="[[*hero.width]]" height="[[*hero.height]]" src="[[*hero.src]]"'
      + ' srcset="[[*hero.srcset]]" sizes="100vw" alt="[[*hero.alt]]">'
      + '<img data-fixed width="[[*fixedImage.width]]" height="[[*fixedImage.height]]"'
      + ' src="[[*fixedImage.src]]" alt="[[*fixedImage.alt]]">'
      + originalMarkup + '</body></html>');
    await saveSource(page, 'templates');

    await page.goto(homeEditor);
    await page.locator('#page-template').selectOption(template);
    await page.locator('#page-h1').fill('A complete site');
    await page.getByRole('tab', { name: 'SEO', exact: true }).click();
    await page.locator('#page-meta-title').fill('Search title');
    await page.locator('#page-meta-description').fill('Search description');
    await page.locator('#page-robots').selectOption('index');
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    await page.locator('#page-og-title').fill('Social title');
    await page.locator('#page-og-description').fill('Social description');

    const selectImage = async (caption: string, filename: string): Promise<void> => {
      await page.getByRole('button', { name: caption, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Image library', exact: true });

      await dialog.getByRole('button', { name: filename, exact: true }).click();
      await dialog.getByRole('button', { name: 'Use image', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
    };

    await selectImage('Image for Open Graph', 'responsive.png');
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    await selectImage('Hero image', 'responsive.png');
    await selectImage('Fixed image', 'original.png');
    await page.getByRole('region', { name: 'Fixed image', exact: true })
      .getByLabel('Image binding', { exact: true }).selectOption('Single');
    await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
    await page.getByText('Page published', { exact: true }).waitFor();

    const publicPage = await f.context.newPage();

    await publicPage.goto(origin + '/');
    expect(await publicPage.title()).toBe('Search title');
    expect(await publicPage.locator('header').textContent()).toBe('Journey header extracted');
    expect(await publicPage.locator('[data-crumbs]').textContent()).toBe('Home / Article');
    expect(await publicPage.locator('[data-pager]').textContent()).toContain('Page 1 of');
    expect(await publicPage.locator('meta[name=description]').getAttribute('content')).toBe('Search description');
    expect(await publicPage.locator('meta[property="og:title"]').getAttribute('content')).toBe('Social title');
    expect(await publicPage.locator('meta[property="og:description"]').getAttribute('content'))
      .toBe('Social description');
    expect(await publicPage.locator('meta[property="og:image"]').getAttribute('content')).toContain('/assets/');
    expect(await publicPage.locator('[data-hero]').getAttribute('srcset')).toContain('w');
    const chosen: string[] = [];

    for (const width of [375, 1440]) {
      await publicPage.setViewportSize({ width, height: 900 });
      await publicPage.reload();
      await expect.poll(() => publicPage.locator('[data-hero]').evaluate((node) => {
        return node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0;
      })).toBe(true);
      chosen.push(await publicPage.locator('[data-hero]').evaluate((node) =>
        node instanceof HTMLImageElement ? node.currentSrc : ''));
    }
    expect(chosen[0]).not.toBe(chosen[1]);
    const fixed = new URL((await publicPage.locator('[data-fixed]').getAttribute('src'))!, origin);

    expect((await fetch(fixed)).status).toBe(200);
    await publicPage.close();
    expect(await (await fetch(origin + '/sitemap.xml')).text()).toContain('<loc>' + origin + '/</loc>');
    await page.waitForURL(origin + site);
    await page.goto(homeEditor);
    await page.getByRole('tab', { name: 'SEO', exact: true }).click();
    expect(await page.locator('#page-meta-title').inputValue()).toBe('Search title');
    await page.locator('#page-meta-title').fill('Revised search title');
    await page.locator('#page-meta-description').fill('Revised search description');
    await page.locator('#page-robots').selectOption('noindex');
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    expect(await page.locator('#page-og-title').inputValue()).toBe('Social title');
    await page.locator('#page-og-title').fill('Revised social title');
    await page.locator('#page-og-description').fill('Revised social description');
    await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
    await page.getByText('Page published', { exact: true }).waitFor();
    const noindex = await (await fetch(origin + '/')).text();

    expect(noindex).toContain('noindex');
    expect(noindex).toContain('Revised search title');
    expect(noindex).toContain('Revised social description');
    expect(await (await fetch(origin + '/sitemap.xml')).text()).not.toContain('<loc>' + origin + '/</loc>');
    const icon = await fetch(origin + '/favicon.ico');

    expect(icon.status).toBe(200);
    expect(Buffer.from(await icon.arrayBuffer())).toEqual(await icoFixture());
    expect(noindex).toContain('/favicon.ico?v=');
    await page.waitForURL(origin + site);

    const createPublishedPage = async (title: string, pathname: string): Promise<string> => {
      await visit('pages/new');
      await page.locator('#page-title').fill(title);
      await page.locator('#page-content').fill('Published ' + title);
      await page.locator('#page-template').selectOption('ZaryaBasic');
      await page.locator('#page-path').fill(pathname);
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByText('Page published', { exact: true }).waitFor();
      await page.waitForURL(origin + site);
      await page.getByRole('treeitem').filter({ has: page.locator('._tree-title', { hasText: title }) }).click();

      return page.url();
    };
    const articleEditor = await createPublishedPage('Article', '/guides/topic/article/');

    expect((await fetch(origin + '/guides/topic/article/')).status).toBe(200);
    expect((await fetch(origin + '/guides/')).status).toBe(404);
    expect((await fetch(origin + '/guides/topic/')).status).toBe(404);
    await visit('urls');
    await page.locator('[data-url-path="/guides/topic/"]').click();
    await page.getByRole('link', { name: 'Create a page at /guides/topic/', exact: true }).click();
    expect(await page.locator('#page-path').inputValue()).toBe('/guides/topic/');
    await page.locator('#page-title').fill('Topic');
    await page.locator('#page-content').fill('A materialized virtual folder.');
    await page.locator('#page-template').selectOption('ZaryaBasic');
    await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
    await page.getByText('Page published', { exact: true }).waitFor();
    expect((await fetch(origin + '/guides/topic/')).status).toBe(200);
    expect(await (await fetch(origin + '/guides/topic/article/')).text()).toContain('Published Article');
    await page.waitForURL(origin + site);
    await page.goto(articleEditor);
    expect(await page.locator('#page-parent option:checked').textContent()).toContain('Topic');
    await visit('urls');
    const urls = page.locator('#urls-workspace');

    await page.locator('[data-url-path="/guides/topic/article/"]').click();
    await urls.getByLabel('New URL path', { exact: true }).fill('/guides/topic/renamed/');
    await urls.getByRole('button', { name: 'Change URL', exact: true }).click();
    await urls.getByRole('heading', { name: '/guides/topic/renamed/', exact: true }).waitFor();
    await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
    const redirect = await fetch(origin + '/guides/topic/article/', { redirect: 'manual' });

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('location')).toBe('/guides/topic/renamed/');
    expect(await (await fetch(origin + '/guides/topic/renamed/')).text()).toContain('Published Article');
    await urls.getByLabel('New URL path', { exact: true }).fill('/guides/topic/final/');
    await urls.getByLabel('Permanently delete the old address', { exact: true }).check();
    await urls.getByRole('button', { name: 'Change URL', exact: true }).click();
    await urls.getByRole('heading', { name: '/guides/topic/final/', exact: true }).waitFor();
    await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
    expect((await fetch(origin + '/guides/topic/renamed/', { redirect: 'manual' })).status).toBe(404);
    const originalRedirect = await fetch(origin + '/guides/topic/article/', { redirect: 'manual' });

    expect(originalRedirect.status).toBe(301);
    expect(originalRedirect.headers.get('location')).toBe('/guides/topic/final/');
    expect(await (await fetch(origin + '/guides/topic/final/')).text()).toContain('Published Article');
    const sitemap = await (await fetch(origin + '/sitemap.xml')).text();

    expect(sitemap).toContain('<loc>' + origin + '/guides/topic/final/</loc>');
    expect(sitemap).not.toContain('<loc>' + origin + '/guides/topic/renamed/</loc>');
    expect(sitemap).not.toContain('<loc>' + origin + '/guides/topic/article/</loc>');
    expect(await (await fetch(origin + '/')).text()).toContain('/favicon.ico?v=');
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}, 180000);
