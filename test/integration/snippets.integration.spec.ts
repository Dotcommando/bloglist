import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_PAGE_RELEASE, PUBLISH_SITE_RELEASE,
  RELEASE_ACTIVATION, RENDER_PUBLISHED_PAGE,
} from '../../src/infra/publication/publication.tokens.js';
import {
  CREATE_RENDERING_ELEMENT, GET_RENDERING_ELEMENT, UPDATE_RENDERING_ELEMENT,
} from '../../src/infra/rendering/rendering.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPublishPageRelease } from '../../src/ports/inbound/publication/publish-page-release.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IRenderPublishedPage } from '../../src/ports/inbound/publication/render-published-page.port.js';
import type {
  ICreateRenderingElement, IGetRenderingElement, IUpdateRenderingElement,
} from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { siteInput } from '../support/sites.js';

describe('editable Snippets and bundled Pagination through real composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let local: INestApplicationContext;
  let http: INestApplication<Server>;
  let root = '';
  let port = 0;
  let siteId = '';
  let parentId = '';
  let childId = '';
  let releaseId = '';

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated test MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/snippets-'));
    const rendering = { sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts') };

    local = await createLocalApplication({
      mongoUri,
      database,
      rendering,
      operator: { operatorId: 'snippet-test', platformAdministrator: true },
      // This fixture exercises rendering; an unrelated hook pump must not compete with bulk setup writes.
      backgroundWork: false,
    });
    const site = await local.get<ICreateSite>(CREATE_SITE).execute(siteInput());

    siteId = site.siteId;
    const create = local.get<ICreatePage>(CREATE_PAGE);
    const configure = local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING);
    const publish = local.get<IPublishPage>(PUBLISH_PAGE);
    const urls = local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL);
    const parent = await create.execute({ siteId, mark: 'PaginationParent', language: 'en', title: 'Pagination' });

    parentId = parent.pageId;
    await configure.execute({
      siteId,
      pageId: parentId,
      actorId: 'snippet-test',
      rendering: {
        templateId: 'ZaryaPagination',
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    const parentUrl = await urls.execute({
      siteId,
      pageId: parentId,
      mark: 'PaginationParentUrl',
      parentUrlId: null,
      segment: 'pagination',
      path: '/pagination/',
    });

    await publish.execute({ siteId, pageId: parentId });

    for (let index = 1; index <= 36; index++) {
      const suffix = String(index).padStart(2, '0');
      const child = await create.execute({
        siteId,
        mark: 'Child' + suffix,
        language: 'en',
        title: 'Child ' + suffix,
        parentPageId: parentId,
        contentMd: '[Parent]([[~' + parent.pageNumber + ']])',
      });

      if (index === 1) {
        childId = child.pageId;
      }
      await configure.execute({
        siteId,
        pageId: child.pageId,
        actorId: 'snippet-test',
        rendering: {
          templateId: 'ZaryaBasic',
          delivery: HtmlDelivery.Static,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      });
      await urls.execute({
        siteId,
        pageId: child.pageId,
        mark: 'ChildUrl' + suffix,
        parentUrlId: parentUrl.urlId,
        segment: 'child-' + suffix,
        path: '/pagination/child-' + suffix + '/',
      });

      if (index <= 35) {
        await publish.execute({ siteId, pageId: child.pageId });
      }
    }
    releaseId = (await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId,
      actorId: 'snippet-test',
      expectedActiveReleaseId:
        (await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId))?.releaseId ?? null,
    })).releaseId;
    http = await createPublicHttpApplication({ mongoUri, database, ...rendering, host: '127.0.0.1', port: 0 });
    const address = http.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing HTTP test listener');
    }
    port = address.port;
  });
  afterAll(async () => {
    await http?.close();
    await local?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Unsafe test database');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  function get(target: string, method = 'GET'): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port,
        path: target,
        method,
        headers: { Host: 'example.test' },
      }, (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });

      outgoing.once('error', reject);
      outgoing.end();
    });
  }

  it('publishes and serves Markdown links by immutable numeric page ID through a frozen release catalog', async () => {
    const result = await get('/pagination/child-01/');

    expect(result.status).toBe(200);
    expect(result.body).toMatch(/<a href=["']?\/pagination\/["']?>Parent<\/a>/);
    expect(result.body).not.toContain('[[~');
  });

  it('serves 10/10/10/5 items by page, excludes drafts, and preserves GET/HEAD validation', async () => {
    for (const [page, count] of [[1, 10], [2, 10], [3, 10], [4, 5]]) {
      const response = await get('/pagination/?page=' + page);

      expect(response.status).toBe(200);
      expect(response.body.match(/class="_pagination-item-link"/g)).toHaveLength(count!);
      expect(response.body).toContain('href="?page=' + page + '" aria-current="page"');
      expect(response.body).not.toContain('Child 36');
    }
    expect((await get('/pagination/')).body).toContain('Child 01');
    expect((await get('/pagination/?page=0')).body).toContain('Child 01');
    expect((await get('/pagination/?page=9999')).body).toContain('Child 35');
    expect((await get('/pagination/?page=1&page=2')).status).toBe(400);
    const referral = await get('/pagination/?limit=10&utm_source=release-check');

    expect(referral.status).toBe(200);
    expect(referral.body).toContain('Child 01');
    expect(await get('/pagination/?page=2', 'HEAD')).toEqual({ status: 200, body: '' });
  });

  it('applies saved Snippets using published child metadata and retains historical release code', async () => {
    const identity = { siteId, kind: TemplateSourceKind.Snippet, key: 'Pagination' };
    const original = await local.get<IGetRenderingElement>(GET_RENDERING_ELEMENT).execute(identity);
    const code = original.snippet!.code.replace('return (', 'const result = (')
      + '\nresult.items[0].title = "Edited snippet"; return result;';
    const saved = await local.get<IUpdateRenderingElement>(UPDATE_RENDERING_ELEMENT).execute({
      ...original, expectedVersion: original.version, snippet: { ...original.snippet!, code },
    });

    expect(saved.backupState).toBe('Ready');
    await local.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId: childId, title: 'PRIVATE DRAFT' });
    const refreshed = await get('/pagination/');

    expect(refreshed.body).toContain('Edited snippet');
    expect(refreshed.body).not.toContain('PRIVATE DRAFT');
    const next = await local.get<IPublishPageRelease>(PUBLISH_PAGE_RELEASE).execute({ siteId, pageId: parentId });
    const response = await get('/pagination/');

    expect(response.body).toContain('Edited snippet');
    expect(response.body).not.toContain('PRIVATE DRAFT');
    expect((await get('/pagination/?page=4')).body).toContain('Child 35');
    const historical = await local.get<IRenderPublishedPage>(RENDER_PUBLISHED_PAGE).execute({
      siteId,
      releaseId,
      renderPlanId: parentId,
    });

    expect(historical.html).toContain('Child 01');
    expect(historical.html).not.toContain('Edited snippet');
    expect(next.publication.releaseId).not.toBe(releaseId);
    const filename = path.join(root, 'sites', 'Site'
      + (await import('node:crypto')).createHash('sha256').update(siteId).digest('hex'),
    'elements/snippets/Pagination.json');

    expect(JSON.parse(await readFile(filename, 'utf8')).snippet.code).toBe(code);
  });

  it('supports native browser pagination without JavaScript across the shared viewport matrix', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const response = await get(url.pathname + url.search);

        await route.fulfill({ status: response.status, body: response.body, contentType: 'text/html' });
      });
      await page.goto('http://example.test/pagination/');

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.getByRole('link', { name: '4', exact: true }).click();
      expect(page.url()).toContain('?page=4');
      expect(await page.locator('.pagination-items li').count()).toBe(5);
      expect(await page.locator('.pagination-items').innerText()).toContain('Child 32');
    } finally {
      await browser.close();
    }
  });

  it('creates a numbered custom Snippet and invokes its TypeScript by key through a real release', async () => {
    const create = local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT);
    const snippet = await create.execute({
      siteId,
      kind: TemplateSourceKind.Snippet,
      name: 'Custom greeting',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: [{ name: 'title', kind: ParameterKind.String, required: true }],
      snippet: {
        code: 'const suffix: string = "ready"; return input.title + " " + suffix;',
        phases: [LoaderPhase.Request],
        output: { name: 'result', kind: ParameterKind.String, required: true },
      },
    });

    expect(snippet.key).toBe('1');
    expect(snippet.backupState).toBe('Ready');
    const siteKey = 'Site' + (await import('node:crypto')).createHash('sha256').update(siteId).digest('hex');
    const filename = path.join(root, 'sites', siteKey, 'elements/snippets/Custom greeting.json');

    expect(JSON.parse(await readFile(filename, 'utf8'))).toMatchObject({ name: 'Custom greeting', key: snippet.key });
    const template = await local.get<IGetRenderingElement>(GET_RENDERING_ELEMENT).execute({
      siteId, kind: TemplateSourceKind.Template, key: 'ZaryaPagination',
    });
    const custom = await create.execute({
      ...template,
      name: 'Custom pagination',
      html: template.html.replace('</main>', '<p>[[!1? &title=`Custom snippet` &as=`greeting`]]'
        + '[[+greeting]]</p></main>'),
    });

    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      pageId: parentId,
      actorId: 'snippet-test',
      rendering: {
        templateId: custom.key,
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await local.get<IPublishPageRelease>(PUBLISH_PAGE_RELEASE).execute({ siteId, pageId: parentId });
    expect((await get('/pagination/')).body).toContain('Custom snippet ready');
    expect((await local.get<IGetRenderingElement>(GET_RENDERING_ELEMENT).execute({
      siteId, kind: TemplateSourceKind.Snippet, key: snippet.key,
    })).usages).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'Page', id: parentId })]));
  });
});
