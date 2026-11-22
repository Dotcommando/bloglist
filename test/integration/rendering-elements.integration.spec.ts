import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  elementSchema, type IElementRecord,
} from '../../src/adapters/outbound/persistence/mongoose/rendering/element.schema.js';
import {
  MongooseElementStore,
} from '../../src/adapters/outbound/persistence/mongoose/rendering/element-store.adapter.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { ElementBackupState } from '../../src/domain/rendering/rendering-element.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import { GET_RENDERING_ELEMENT, LIST_RENDERING_ELEMENTS } from '../../src/infra/rendering/rendering.tokens.js';
import type {
  IGetRenderingElement, IListRenderingElements,
} from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { account } from '../support/admin-users.js';
import { elementFixture } from '../support/rendering.js';

describe('site-owned rendering entities through real composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplication<Server>;
  let local: INestApplicationContext;
  let root = '';
  let origin = '';
  let cookie = '';
  let siteId = '';
  let pageId = '';
  let sourcePath = '';
  const source = {
    name: 'Date Chunk',
    html: '<footer>Old footer</footer>',
    css: 'footer{color:red}',
    browserTypeScript: null,
    parameters: [],
  };

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated test MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/rendering-elements-'));
    await mkdir(path.join(root, 'sites'), { recursive: true });
    const password = 'synthetic rendering password';
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await new MongooseAdminUserStore(connection).run(async (work) => {
      await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    origin = 'http://127.0.0.1:' + address.port;
    const settings = {
      mongoUri,
      database,
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
    };

    app = await createPublicHttpApplication({
      ...settings,
      host: '127.0.0.1',
      port: address.port,
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
    });
    local = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      rendering: settings,
    });
    const login = await command('/api/admin/auth/login', { email: 'user-1@example.test', password });

    expect(login.status).toBe(200);
    cookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? '';
    const site = await json(await command('/api/admin/sites', {
      mark: 'RenderingTest',
      name: 'Rendering test',
      primaryDomain: '127.0.0.1',
      languages: ['en'],
      defaultLanguage: 'en',
    }), 201);

    siteId = string(site.siteId);
    sourcePath = '/api/admin/sites/' + siteId;
  });
  afterAll(async () => {
    await local?.close();
    await app?.close();

    if (connection) {
      if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
        throw new Error('Unsafe database cleanup');
      }
      await connection.dropDatabase();
      await connection.close();
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  function command(route: string, body: unknown): Promise<Response> {
    return fetch(origin + route, {
      method: 'POST',
      headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  }
  function get(route: string): Promise<Response> {
    return fetch(origin + route, { headers: { Cookie: cookie } });
  }
  async function json(response: Response, status = 200): Promise<Record<string, unknown>> {
    const body: unknown = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(status);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid response');
    }

    return Object.fromEntries(Object.entries(body));
  }
  function string(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Expected string');
    }

    return value;
  }

  it('protects and version-guards the JSON-LD catalog through real HTTP composition', async () => {
    const route = sourcePath + '/json-ld';
    const anonymous = await fetch(origin + route);

    expect(anonymous.status).toBe(401);
    expect(await json(await get(route))).toEqual({ siteId, version: '0', profiles: [], objects: [] });
    const profiles = [{
      profileId: 'article',
      name: 'Article',
      templateIds: [],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [{
          property: 'headline', required: true, source: { kind: 'pageField', name: 'title' },
        }],
      }],
    }];
    const saved = await json(await command(route, { expectedVersion: '0', profiles, objects: [] }));

    expect(saved.profiles).toEqual(profiles);

    expect(string(saved.version)).not.toBe('0');
    expect(await json(await get(route))).toEqual(saved);
    expect((await command(route, { expectedVersion: '0', profiles: [], objects: [] })).status).toBe(409);
  });

  it('creates entities and backups, resolves local ports, checks uniqueness, ownership and stale updates', async() => {
    const chunk = await json(await command(sourcePath + '/chunks', { ...source }), 201);

    expect(chunk.backupState).toBe('Ready');
    const template = {
      name: 'Home',
      html: '<!doctype html><html><head><title>[[*title]]</title></head>'
        + '<body><h1>[[*title]]</h1>[[$Date_Chunk]]</body></html>',
      css: 'body{margin:0}',
      browserTypeScript: null,
      parameters: [],
    };
    const created = await json(await command(sourcePath + '/templates', { ...template }), 201);

    expect(created.backupState).toBe('Ready');
    expect(chunk.key).toBe('1');
    expect(created.key).toBe('1');
    expect((await command(sourcePath + '/chunks', { key: '1', ...source })).status).toBe(400);
    const current = await local.get<IGetRenderingElement>(GET_RENDERING_ELEMENT).execute({
      siteId,
      kind: TemplateSourceKind.Chunk,
      key: '1',
    });

    expect(current.version).toBe(chunk.version);
    const templates = await local.get<IListRenderingElements>(LIST_RENDERING_ELEMENTS)
      .execute({ siteId, kind: TemplateSourceKind.Template });

    expect(templates.map((item) => item.key).sort()).toEqual(['1', 'ZaryaBasic', 'ZaryaPagination']);
    expect((await get('/api/admin/sites/missing/chunks/1')).status).toBe(404);
    expect((await command(sourcePath + '/chunks/1', { ...source, expectedVersion: 'stale' })).status).toBe(409);
    const page = await json(await command(sourcePath + '/pages', {
      mark: 'Home',
      language: 'en',
      title: 'Preview page',
      contentMd: 'Content',
    }), 201);

    pageId = string(page.pageId);
    const published = await command(sourcePath + '/pages/' + pageId + '/publication', {
      templateId: '1',
      path: '/',
    });

    expect(published.status).toBe(200);
    expect(await (await fetch(origin + '/')).text()).toContain('Old footer');
  });

  it('keeps drafts private, compiles a protected preview and applies shared edits on publication', async () => {
    const current = await json(await get(sourcePath + '/chunks/1'));
    const next = await json(await command(sourcePath + '/chunks/1', {
      ...source,
      html: '<footer>New footer</footer>',
      expectedVersion: current.version,
    }));

    expect(next.backupState).toBe('Ready');
    const activation = local.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const active = await activation.getActive(siteId);

    expect(await (await fetch(origin + '/')).text()).toContain('Old footer');
    const preview = await json(await command(sourcePath + '/chunks/1/preview', {
      pageId,
      expectedVersion: next.version,
    }));

    expect((await fetch(origin + string(preview.url))).status).toBe(401);
    const document = await get(string(preview.url));

    expect(document.status).toBe(200);
    expect(document.headers.get('Content-Security-Policy')).toContain('sandbox allow-scripts;');
    expect(document.headers.get('Content-Security-Policy')).not.toContain('allow-same-origin');
    expect(await document.text()).toContain('New footer');
    expect(await activation.getActive(siteId)).toEqual(active);
    expect((await command(sourcePath + '/publish', {})).status).toBe(200);
    expect(await (await fetch(origin + '/')).text()).toContain('New footer');
  });

  it('uses the database before files and recovers the full backed-up entity after database absence', async() => {
    const current = await json(await get(sourcePath + '/chunks/1'));
    const model = connection.model<IElementRecord>('RenderingElement', elementSchema);
    const [siteKey] = await readdir(path.join(root, 'sites'));
    const backup = path.join(root, 'sites', siteKey!, 'elements/chunks/' + source.name + '.json');
    const original = await readFile(backup, 'utf8');

    await writeFile(backup, 'not valid JSON');
    expect((await json(await get(sourcePath + '/chunks/1'))).version).toBe(current.version);
    await writeFile(backup, original);
    await model.deleteOne({ siteId, kind: TemplateSourceKind.Chunk, key: '1' });
    expect((await json(await get(sourcePath + '/chunks/1'))).version).toBe(current.version);
    await connection.db!.collection('rendering_element_sequences').deleteOne({ siteId, kind: 'Chunk' });
    const next = await json(await command(sourcePath + '/chunks', { ...source, name: 'After recovery' }), 201);

    expect(next.key).toBe('2');
    const adopted = await json(await command(sourcePath + '/chunks/1', {
      ...source,
      html: '<footer>Recovered</footer>',
      expectedVersion: current.version,
    }));

    expect(adopted.backupState).toBe('Ready');
    expect(await model.countDocuments({ siteId, kind: TemplateSourceKind.Chunk, key: '1' })).toBe(1);
    expect(JSON.parse(await readFile(backup, 'utf8')).html).toContain('Recovered');
  });

  it('creates distinct numbered entities concurrently, retaining names in the list and file backups', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      command(sourcePath + '/chunks', { ...source, name: 'Concurrent ' + index })
        .then((response) => json(response, 201))));
    const created = outcomes.map((outcome) => {
      if (outcome.status === 'rejected') {
        throw outcome.reason;
      }

      return outcome.value;
    });

    expect(created.every((item) => item.backupState === 'Ready')).toBe(true);
    expect(new Set(created.map((item) => item.key)).size).toBe(8);
    const listed = await json(await get(sourcePath + '/chunks'));

    expect(listed.items).toEqual(expect.arrayContaining(created.map((item) => expect.objectContaining({
      key: item.key, name: item.name,
    }))));
    const [siteKey] = await readdir(path.join(root, 'sites'));

    for (const item of created) {
      const file = path.join(root, 'sites', siteKey!, 'elements/chunks/' + string(item.name) + '.json');

      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ key: item.key, name: item.name });
    }
  });

  it('renames the chunk copy with its display name while keeping runtime references valid', async () => {
    const current = await json(await get(sourcePath + '/chunks/1'));
    const renamed = await json(await command(sourcePath + '/chunks/1', {
      ...source, name: 'Readable renamed chunk', expectedVersion: current.version,
    }));
    const [siteKey] = await readdir(path.join(root, 'sites'));
    const directory = path.join(root, 'sites', siteKey!, 'elements/chunks');

    expect(renamed).toMatchObject({ key: '1', backupState: 'Ready' });
    expect(JSON.parse(await readFile(path.join(directory, 'Readable renamed chunk.json'), 'utf8')))
      .toMatchObject({ key: '1', name: 'Readable renamed chunk' });
    await expect(readFile(path.join(directory, source.name + '.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    const restored = await json(await command(sourcePath + '/chunks/1', {
      ...source, expectedVersion: renamed.version,
    }));

    expect(restored.backupState).toBe('Ready');
    await expect(readFile(path.join(directory, 'Readable renamed chunk.json')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('permits one concurrent update and retains pending state on a failed guarded backup', async() => {
    const current = await json(await get(sourcePath + '/chunks/1'));
    const outcomes = await Promise.all(['One', 'Two'].map((value) => command(sourcePath + '/chunks/1', {
      ...source, html: '<footer>' + value + '</footer>', expectedVersion: current.version,
    })));

    expect(outcomes.map((item) => item.status).sort()).toEqual([200, 409]);
    const model = connection.model<IElementRecord>('RenderingElement', elementSchema);
    const store = new MongooseElementStore(model);
    const pending = elementFixture({
      siteId,
      key: 'Pending',
      elementId: 'pending-id',
      backupState: ElementBackupState.Pending,
    });

    await store.save(pending, null);
    await expect(store.synchronizeBackup(pending, pending.version, async() => {
      throw new Error('Disk error');
    })).rejects.toThrow('Disk error');
    expect((await store.find(pending))?.backupState).toBe('Pending');
    const ready = await store.synchronizeBackup(pending, pending.version, async() => {});

    expect(ready.backupState).toBe('Ready');
    const { elementId, ...state } = ready;
    const db = connection.db;

    if (!db) {
      throw new Error('Missing test database');
    }

    const invalid = {
      ...state,
      _id: elementId + '-invalid',
      key: 'Invalid',
      parameters: [{ name: 'invalid', kind: 'Unknown', required: 'yes' }],
    };

    await expect(db.collection<{ _id: string }>('rendering_elements').insertOne(invalid))
      .rejects.toMatchObject({ code: 121 });
    await verifyMigrations(connection, 'migrations');
  });

  it('saves a draft, runs a protected compiled preview and applies changes through the real browser', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      await page.goto(origin + '/admin/sites/' + siteId + '/chunks/1');
      await page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<footer>Saved in browser</footer>');
      await page.getByRole('button', { name: 'Browser TypeScript', exact: true }).click();
      await page.getByRole('textbox', { name: 'Browser TypeScript', exact: true })
        .fill('document.querySelector("footer")?.setAttribute("data-ready", "yes");');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
      const stored = await json(await get(sourcePath + '/chunks/1'));

      expect(stored.html).toBe('<footer>Saved in browser</footer>');
      expect(await (await fetch(origin + '/')).text()).not.toContain('Saved in browser');
      await page.getByLabel('Page for preview', { exact: true }).selectOption(pageId);
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.frameLocator('.source-preview iframe');

      await preview.locator('footer[data-ready="yes"]').waitFor();
      expect(await preview.locator('footer').textContent()).toBe('Saved in browser');
      expect(await preview.locator('body').evaluate(() => {
        try {
          return parent.document.URL;
        } catch {
          return 'blocked';
        }
      })).toBe('blocked');
      await page.getByRole('button', { name: 'HTML', exact: true }).click();
      await page.getByRole('textbox', { name: 'HTML', exact: true }).fill('<footer>Applied in browser</footer>');
      await page.getByRole('button', { name: 'Save & apply', exact: true }).click();
      await page.getByText('Changes saved and applied. Site published.', { exact: true }).waitFor();
      expect(await (await fetch(origin + '/')).text()).toContain('Applied in browser');
      expect((await json(await get(sourcePath + '/chunks/1'))).html).toBe('<footer>Applied in browser</footer>');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });

  it('keeps the active release on an ambiguous name and still permits publication by key', async () => {
    const activation = local.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const active = await activation.getActive(siteId);

    await json(await command(sourcePath + '/chunks', { ...source, name: 'Date_Chunk' }), 201);
    expect((await command(sourcePath + '/publish', {})).status).toBe(400);
    expect(await activation.getActive(siteId)).toEqual(active);
    const template = await json(await get(sourcePath + '/templates/1'));

    await json(await command(sourcePath + '/templates/1', {
      name: template.name,
      html: string(template.html).replace('[[$Date_Chunk]]', '[[$1]]'),
      css: template.css,
      browserTypeScript: template.browserTypeScript,
      parameters: template.parameters,
      expectedVersion: template.version,
    }));
    expect((await command(sourcePath + '/publish', {})).status).toBe(200);
    expect(await (await fetch(origin + '/')).text()).toContain('Applied in browser');
  });

  it('saves dependent drafts separately and publishes after declaring the forwarded chunk parameter', async () => {
    const chunk = await json(await command(sourcePath + '/chunks', {
      ...source, name: 'Parameter evolution', html: '<span>Before</span>',
    }), 201);
    const chunkPath = sourcePath + '/chunks/' + string(chunk.key);
    const template = await json(await get(sourcePath + '/templates/1'));
    const call = '[[$' + string(chunk.key) + '? &title=`Дата`]]';
    const templateContent = {
      name: template.name,
      html: string(template.html).replace('</body>', call + '</body>'),
      css: template.css,
      browserTypeScript: template.browserTypeScript,
      parameters: template.parameters,
    };

    await json(await command(chunkPath, {
      ...source, name: chunk.name, html: '<span>[[+title]]</span>', expectedVersion: chunk.version,
    }));
    await json(await command(sourcePath + '/templates/1', {
      ...templateContent, expectedVersion: template.version,
    }));
    const activation = local.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const active = await activation.getActive(siteId);
    const rejected = await command(sourcePath + '/publish', {});

    expect(await json(rejected, 400)).toMatchObject({
      error: 'Validation',
      diagnostic: {
        issue: 'UnknownChunkParameter', source: { kind: 'Chunk', key: chunk.key }, parameter: 'title',
      },
    });
    expect(await activation.getActive(siteId)).toEqual(active);
    const current = await json(await get(chunkPath));

    await json(await command(chunkPath, {
      ...source,
      name: chunk.name,
      html: '<span>[[+title]]</span>',
      parameters: [{ name: 'title', kind: 'String', required: true }],
      expectedVersion: current.version,
    }));
    expect((await command(sourcePath + '/publish', {})).status).toBe(200);
    expect(await (await fetch(origin + '/')).text()).toContain('<span>Дата</span>');
  });
});
