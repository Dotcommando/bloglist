/* global document, window */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

const database = process.env.ZARYA_MONGO_DATABASE;

const origin = process.env.ZARYA_ADMIN_AUTH_ORIGIN;

const mutate = process.argv.includes('--mutate');

const candidateIndex = process.argv.indexOf('--candidate-assets');

const candidate = candidateIndex < 0 ? null : process.argv[candidateIndex + 1];

if (!/^bloglist_trial(?:_qa_[0-9]+)?$/.test(database ?? '') || origin !== 'http://localhost:3002') {
  throw new Error('Browser verification requires the explicit isolated Bloglist trial');
}

if (mutate && !/^bloglist_trial_qa_[0-9]+$/.test(database)) {
  throw new Error('Mutating browser checks are restricted to disposable QA installations');
}

if (candidateIndex >= 0 && !candidate) {
  throw new Error('--candidate-assets requires a built runtime directory');
}

const evidenceRoot = '.tmp/' + database;

const credentials = JSON.parse(await readFile(evidenceRoot + '/credentials.json', 'utf8'));

const site = JSON.parse(await readFile(evidenceRoot + '/site.json', 'utf8'));

await mkdir(evidenceRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.BLOGLIST_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const pendingResponses = [];

const failures = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    process.stdout.write('Browser error: ' + error.message + '\n');
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('/bloglist/clusters')) {
      process.stdout.write('API ' + response.status() + ': ' + new URL(response.url()).search + '\n');
    }
  });

  if (candidate) {
    await page.route('**/addon-runtime/bloglist/**/admin/*', async (route) => {
      const filename = path.basename(new URL(route.request().url()).pathname);

      if (filename === 'runtime.js' || filename === 'runtime.css') {
        await route.fulfill({
          path: path.join(candidate, 'admin', filename),
          contentType: filename.endsWith('.js') ? 'text/javascript' : 'text/css',
        });
      } else {
        await route.continue();
      }
    });
  }
  function waitForResponse(predicate) {
    const response = page.waitForResponse(predicate);

    pendingResponses.push(Promise.allSettled([response]));

    return response;
  }
  function listResponse(predicate = () => true) {
    return waitForResponse((response) => {
      const url = new URL(response.url());

      return response.request().method() === 'GET'
        && url.pathname === '/api/admin/sites/' + site.siteId + '/bloglist/clusters'
        && predicate(url.searchParams);
    });
  }
  async function rows(count) {
    if (count > 0) {
      await page.locator('aside._cluster-drawer ._tree-page').first().waitFor();
    }
    const deadline = Date.now() + 10000;
    while (await page.locator('aside._cluster-drawer ._tree-page').count() !== count) {
      if (Date.now() >= deadline) { throw new Error('Unexpected cluster row count'); }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  async function search(value) {
    process.stdout.write('Checking search: ' + value + '\n');
    const response = listResponse((query) => query.get('search') === value);

    await page.locator('#bloglist-cluster-search').fill(value);
    const result = await response;

    assert.equal(result.status(), 200);
    const body = await result.json();

    await rows(body.items.length);

    return body;
  }
  await page.goto(origin + '/admin/', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(credentials.email);
  await page.locator('input[type=password]').fill(credentials.password);
  await page.getByRole('button', { name: /sign in|войти/i }).click();
  const initial = listResponse();

  await page.getByRole('button', { name: 'Bloglist', exact: true }).click();
  const rootCount = (await (await initial).json()).total;

  assert.equal(database === 'bloglist_trial' ? rootCount === 125 : rootCount >= 125, true);
  const rootPage = '/ ' + Math.ceil(rootCount / 25) + ' · ' + rootCount;

  assert.equal((await initial).status(), 200);
  await page.screenshot({ path: evidenceRoot + '/clusters-initial.png' });
  process.stdout.write('Tree rows: ' + await page.locator('aside._cluster-drawer ._tree-page').count() + '\n');
  await rows(25);
  const firstNames = await page.locator('aside._cluster-drawer ._tree-page').allTextContents();
  const rootPager = page.locator('aside._cluster-drawer > ._cluster-pager');
  const arrowStroke = await rootPager.getByRole('button', { name: 'Next page', exact: true })
    .locator('svg path').evaluate(element => getComputedStyle(element).stroke);
  assert.notEqual(arrowStroke, 'none', 'The pagination arrow must be visible');

  assert.equal((await rootPager.locator('span').innerText()).replace(/\s/g, ''), rootPage.replace(/\s/g, ''));
  assert.equal(await rootPager.getByRole('spinbutton').inputValue(), '1');
  const next = listResponse((query) => query.has('afterId'));

  await rootPager.getByRole('button', { name: 'Next page', exact: true }).click();
  const second = await (await next).json();

  assert.equal(second.items.length, 25);
  await page.locator('aside._cluster-drawer ._tree-page').first().filter({ hasText: second.items[0].name }).waitFor();
  const secondNames = await page.locator('aside._cluster-drawer ._tree-page').allTextContents();

  assert.equal(secondNames.some((name) => firstNames.includes(name)), false);
  const previous = listResponse((query) => !query.has('afterId'));

  await rootPager.getByRole('button', { name: 'Previous page', exact: true }).click();
  await previous;
  await page.locator('aside._cluster-drawer ._tree-page').first().filter({ hasText: firstNames[0].trim() }).waitFor();
  const disclosure = page.locator('aside._cluster-drawer ._tree-page').filter({ hasText: 'Инструменты · подборка 125' })
    .first().locator('[data-tree-toggle]');
  const children = listResponse((query) => query.has('parentClusterId'));

  await disclosure.click();
  assert.equal((await (await children).json()).total, 125);
  await rows(50);
  const childPager = page.locator('aside._cluster-drawer ._tree-scroll ._cluster-pager').first();
  const childNext = listResponse((query) => query.has('parentClusterId') && query.has('afterId'));

  await childPager.getByRole('button', { name: 'Next page', exact: true }).click();
  await childNext;
  assert.equal((await rootPager.locator('span').innerText()).replace(/\s/g, ''), rootPage.replace(/\s/g, ''));
  assert.equal(await rootPager.getByRole('spinbutton').inputValue(), '1');
  assert.equal(await childPager.getByRole('spinbutton').inputValue(), '2');
  const found = await search('Деревообработк станк');

  assert.equal(found.total, 1);
  assert.equal(found.items[0].name, 'Блог про станки деревообработки');
  assert.equal((await search('.*')).total, 0);
  await page.locator('#bloglist-cluster-search').fill('');
  await rows(50);
  assert.equal(await childPager.getByRole('spinbutton').inputValue(), '2');
  const rootJump = listResponse(query => query.get('page') === '5' && !query.has('parentClusterId'));

  await rootPager.getByRole('spinbutton').fill('5');
  await rootPager.getByRole('spinbutton').press('Enter');
  assert.equal((await (await rootJump).json()).items.length, 25);
  assert.equal(await rootPager.getByRole('spinbutton').inputValue(), '5');
  const rootBack = listResponse(query => query.get('page') === '1' && !query.has('parentClusterId'));

  await rootPager.getByRole('spinbutton').fill('1');
  await rootPager.getByRole('spinbutton').press('Enter');
  await rootBack;
  await rows(50);
  assert.equal(await childPager.getByRole('spinbutton').inputValue(), '2');
  const childJump = listResponse(query => query.get('page') === '5' && query.has('parentClusterId'));

  await childPager.getByRole('spinbutton').fill('5');
  await childPager.getByRole('spinbutton').press('Enter');
  await childJump;
  assert.equal(await childPager.getByRole('spinbutton').inputValue(), '5');
  assert.equal(await rootPager.getByRole('spinbutton').inputValue(), '1');
  assert.equal(await page.locator('aside._cluster-drawer.page-drawer').count(), 1);
  assert.equal(await page.locator('aside').getByRole('button', { name: 'Create cluster', exact: true }).count(), 1);
  await page.locator('aside._cluster-drawer ._tree-page').first().click();
  await page.locator('#bloglist-name').waitFor();
  await page.screenshot({ path: evidenceRoot + '/clusters-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: evidenceRoot + '/clusters-mobile.png' });
  await page.getByRole('button', { name: '← Back to list', exact: true }).click();
  assert.equal(await page.locator('#bloglist-cluster-search').isVisible(), true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  if (mutate) {
    await page.getByRole('button', { name: 'Create cluster', exact: true }).click();
    const name = 'QA cluster ' + Date.now();

    await page.locator('#bloglist-name').fill(name);
    await page.locator('#bloglist-query').fill('QA primary query');
    await page.locator('#bloglist-description').fill('QA description');
    const created = waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/bloglist/clusters'));

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const createdResponse = await created;

    assert.equal(createdResponse.status(), 200);
    const record = await createdResponse.json();

    await page.waitForFunction((value) => document.querySelector('#bloglist-name')?.value === value, name);
    await page.getByRole('button', { name: '+ Child cluster', exact: true }).waitFor();
    await page.locator('#bloglist-name').fill(name + ' edited');
    const edited = waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/bloglist/clusters/' + record.clusterId));

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await edited).status(), 200);
    await page.getByRole('button', { name: '+ Child cluster', exact: true }).click();
    await page.locator('#bloglist-name').fill(name + ' child');
    const childCreated = waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/bloglist/clusters'));

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await childCreated).status(), 200);
    await page.getByRole('button', { name: '+ Child cluster', exact: true }).waitFor();
    await page.locator('._cluster-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#bloglist-page-size').fill('50');
    const resized = listResponse((query) => query.get('limit') === '50');

    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await resized;
    await rows(50);
    await page.locator('#bloglist-page-size').fill('25');
    const restored = listResponse((query) => query.get('limit') === '25');

    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await restored;
    await rows(25);
  }
  assert.deepEqual(pageErrors, []);
  process.stdout.write('Verified: initial render, independent pagination, literal AND search, '
    + 'create/edit/settings=' + mutate + ', desktop/mobile, no browser exceptions.\n');
} catch (error) {
  failures.push(error);
} finally {
  const outcomes = await Promise.allSettled([browser.close(), ...pendingResponses]);

  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      failures.push(outcome.reason);
    } else if (Array.isArray(outcome.value)) {
      for (const response of outcome.value) {
        if (response.status === 'rejected') {
          failures.push(response.reason);
        }
      }
    }
  }

}

if (failures.length) {
  throw new AggregateError([...new Set(failures)], 'Browser verification failed');
}
