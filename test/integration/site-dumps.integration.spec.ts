import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection, mongo } from 'mongoose';

import { writeDumpRecords } from '../../src/adapters/outbound/backup/files/dump-archive.js';
import { applySwaps } from '../../src/adapters/outbound/backup/files/dump-files.js';
import { FileSiteDumpStore } from '../../src/adapters/outbound/backup/files/site-dump-store.adapter.js';
import { DumpDatabase } from '../../src/adapters/outbound/backup/mongoose/dump-database.adapter.js';
import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  PublicationDirectoryAdapter,
} from '../../src/adapters/outbound/publication/files/publication-directory.adapter.js';
import { FileElementBackupAdapter } from '../../src/adapters/outbound/rendering/files/element-backup.adapter.js';
import { FileRenderingSourceAdapter } from '../../src/adapters/outbound/rendering/files/rendering-source.adapter.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { paginationSnippetSource } from '../../src/domain/rendering/pagination-snippet.js';
import {
  CREATE_SITE_DUMP, GET_SITE_DUMP, IMPORT_SITE_DUMP, LIST_SITE_DUMPS, RESTORE_SITE_DUMP,
  SITE_DUMP_STORE,
} from '../../src/infra/dumps/dumps.tokens.js';
import { HookWorkerLifecycle } from '../../src/infra/hooks/hook-worker.lifecycle.js';
import { LIST_JSON_LD_CATALOG, SAVE_JSON_LD_CATALOG } from '../../src/infra/json-ld/json-ld.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { SITE_FAVICON_OPERATIONS } from '../../src/infra/media/media.tokens.js';
import { CREATE_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import { PUBLICATION_STORE } from '../../src/infra/publication/publication.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE,
} from '../../src/infra/publication/publication.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { UPDATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type {
  ICreateSiteDump, IGetSiteDump, IImportSiteDump, IListSiteDumps, IRestoreSiteDump,
} from '../../src/ports/inbound/dumps/site-dumps.port.js';
import type { IListJsonLdCatalog, ISaveJsonLdCatalog } from '../../src/ports/inbound/json-ld/json-ld-catalog.port.js';
import type { ISiteFaviconOperations } from '../../src/ports/inbound/media/site-favicon.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IUpdateSite } from '../../src/ports/inbound/sites/update-site.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { icoFixture } from '../support/favicon.js';
import { elementFixture } from '../support/rendering.js';
import { siteInput } from '../support/sites.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid record');
  }

  return Object.fromEntries(Object.entries(value));
}

describe('complete site dumps with isolated MongoDB and real filesystem', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let local: INestApplicationContext;
  let root: string;
  let siteId: string;
  let otherId: string;
  let pageId: string;
  let filename: string;
  let releaseId: string;
  let dumpBytes: Buffer;
  const actorId = 'dump-test';
  const input = (): { siteId: string; actorId: string } => ({ siteId, actorId });
  const settings = (): { root: string; sourcesRoot: string; artifactsRoot: string; mediaRoot: string } => ({
    root: path.join(root, 'dumps'),
    sourcesRoot: path.join(root, 'sites'),
    artifactsRoot: path.join(root, 'artifacts'),
    mediaRoot: path.join(root, 'media'),
  });

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/site-dumps-'));
    local = await createLocalApplication({
      mongoUri,
      database,
      dumpsRoot: settings().root,
      rendering: { sourcesRoot: settings().sourcesRoot, artifactsRoot: settings().artifactsRoot },
      media: { root: settings().mediaRoot, publicBaseUrl: '/assets' },
      operator: { operatorId: actorId, platformAdministrator: true },
    });
    // This fixture mutates through local ports; keep its background writer quiescent.
    await local.get(HookWorkerLifecycle).onApplicationShutdown();
    const create = local.get<ICreateSite>(CREATE_SITE);

    siteId = (await create.execute(siteInput())).siteId;
    otherId = (await create.execute({ ...siteInput(), mark: 'Other', primaryDomain: 'other.test' })).siteId;
    await mkdir(path.join(root, 'sites', 'Example', 'chunks', 'Legacy'), { recursive: true });
    await writeFile(path.join(root, 'sites', 'Example', 'site.config.json'), JSON.stringify({ siteId }));
    await writeFile(path.join(root, 'sites', 'Example', 'chunks', 'Legacy', 'index.html'), '<p>Legacy chunk</p>');
    await writeFile(path.join(root, 'sites', 'Example', 'chunks', 'Legacy', 'chunk.config.ts'),
      'export default { parameters: [] };');
    const backup = new FileElementBackupAdapter(settings().sourcesRoot,
      new FileRenderingSourceAdapter(settings().sourcesRoot));

    await backup.write(elementFixture({
      elementId: 'file-snippet',
      siteId,
      key: '77',
      name: 'File Snippet',
      kind: TemplateSourceKind.Snippet,
      html: '',
      snippet: paginationSnippetSource,
    }));
    await writeFile(path.join(root, 'media', 'example.test', 'files', 'document.bin'), Buffer.from([0, 1, 255, 42]));
    await writeFile(path.join(root, 'media', 'example.test', '.private', 'original.bin'), 'private original');
    pageId = (await local.get<ICreatePage>(CREATE_PAGE).execute({
      siteId, mark: 'Home', language: 'en', title: 'Dump original',
    })).pageId;
    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      pageId,
      actorId,
      rendering: {
        templateId: 'ZaryaBasic',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId,
      pageId,
      mark: 'HomeUrl',
      parentUrlId: null,
      segment: 'home',
      path: '/home/',
    });
    await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId });
    releaseId = (await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId,
      actorId,
      expectedActiveReleaseId: (await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION)
        .getActive(siteId))?.releaseId ?? null,
    })).releaseId;
    await connection.db!.createCollection('synthetic_records', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['_id', 'siteId', 'exact'],
          properties: {
            _id: { bsonType: 'string' }, siteId: { bsonType: 'string' }, exact: { bsonType: 'long' },
          },
        },
      },
    });
    await connection.db!.collection<mongo.Document & { _id: string }>('synthetic_records').insertMany([
      { _id: 'mine', siteId, exact: mongo.Long.fromString('9223372036854775807') },
      { _id: 'foreign', siteId: otherId, exact: mongo.Long.fromString('9007199254740993') },
    ]);
  }, 30000);

  afterAll(async () => {
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
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('restores the selected site JSON-LD catalog without touching another site', async () => {
    const synthetic = await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'GraphRestore', primaryDomain: 'graph-restore.test',
    });
    const selected = { siteId: synthetic.siteId, actorId };
    const save = local.get<ISaveJsonLdCatalog>(SAVE_JSON_LD_CATALOG);
    const list = local.get<IListJsonLdCatalog>(LIST_JSON_LD_CATALOG);
    const original = await save.execute({ ...selected, expectedVersion: '0', profiles: [], objects: [] });
    const other = await save.execute({ siteId: otherId, expectedVersion: '0', profiles: [], objects: [] });
    const dump = await local.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute(selected);

    await save.execute({ ...selected, expectedVersion: original.version, profiles: [], objects: [] });
    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({ ...selected, filename: dump.filename });
    expect(await list.execute(selected)).toEqual(original);
    expect(await list.execute({ siteId: otherId })).toEqual(other);
    await expect(local.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute(selected)).resolves.toMatchObject({
      filename: expect.any(String),
    });
  });

  it('restores the replaceable favicon from a full site dump', async () => {
    const synthetic = await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'FaviconArchive', primaryDomain: 'favicon-archive.test',
    });
    const selected = { siteId: synthetic.siteId, actorId };
    const icons = local.get<ISiteFaviconOperations>(SITE_FAVICON_OPERATIONS);
    const first = await icoFixture(32);
    const original = await icons.upload.execute({
      siteId: selected.siteId, filename: 'favicon.ico', content: assetBinary(first, 'image/x-icon'),
    });
    const dump = await local.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute(selected);

    await icons.upload.execute({
      siteId: selected.siteId, filename: 'favicon.ico', content: assetBinary(await icoFixture(64), 'image/x-icon'),
    });
    expect((await icons.get.execute(selected))?.width).toBe(64);
    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({ ...selected, filename: dump.filename });
    expect(await icons.get.execute(selected)).toEqual(original);
    expect(await readFile(path.join(root, 'media', 'favicon-archive.test', '.private', 'favicon.ico'))).toEqual(first);
    expect(await icons.get.execute({ siteId: otherId })).toBeNull();
  });

  it('creates one gzip with extension data, private files and file-only sources', async () => {
    const dump = await local.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute(input());

    filename = dump.filename;
    const result = await local.get<IGetSiteDump>(GET_SITE_DUMP).execute({ ...input(), filename });
    const chunks = [];

    for await (const bytes of result.content.bytes) {
      chunks.push(bytes);
    }
    dumpBytes = Buffer.concat(chunks);
    expect(dumpBytes.length).toBe(dump.byteSize);
    const records = gunzipSync(dumpBytes).toString('utf8').trim().split('\n').map((line) => object(JSON.parse(line)));

    expect(records.some((record) => record.kind === 'file' && record.path === '.private/original.bin')).toBe(true);
    expect(records.some((record) => record.kind === 'file'
      && String(record.path).includes('File Snippet.json'))).toBe(true);
    expect(records.some((record) => record.kind === 'document'
      && record.collection === 'synthetic_records')).toBe(true);
    expect(records.some((record) => record.collection === 'admin_users')).toBe(false);
    expect(records.filter((record) => record.collection === 'sites')).toHaveLength(1);
    const savedReleases = await connection.db!.collection('publication_releases').find({ siteId, state: 'Ready' })
      .toArray();

    expect(object(records[0]!.layout).artifactDirectories).toEqual(savedReleases.map((release) =>
      'sites/example.test/' + String(release._id)).sort());
    expect(await connection.db!.collection('rendering_elements').countDocuments({ siteId })).toBe(0);
  });

  it('replaces only the selected site and adopts Snippets and legacy chunks into both DB and files', async () => {
    const pages = connection.db!.collection<mongo.Document & { _id: string }>('pages');

    await pages.updateOne({ siteId, _id: pageId }, {
      $set: {
        createdBy: 'local-author', accessGroupId: 'local-group',
      },
    });
    await local.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title: 'Changed after dump' });
    await writeFile(path.join(root, 'media', 'example.test', 'files', 'document.bin'), 'changed');
    await writeFile(path.join(root, 'media', 'example.test', 'files', 'extra.txt'), 'should disappear');
    await local.get<IUpdateSite>(UPDATE_SITE).execute({ siteId, primaryDomain: 'renamed.test' });
    expect(await readFile(path.join(settings().artifactsRoot, 'sites/renamed.test', releaseId,
      'public/home/index.html'), 'utf8')).toContain('Dump original');
    await rm(path.join(root, 'sites', 'Example'), { recursive: true });
    await rm(settings().artifactsRoot, { recursive: true });
    const imported = await local.get<IImportSiteDump>(IMPORT_SITE_DUMP).execute({
      ...input(),
      content: {
        byteSize: dumpBytes.length,
        mimeType: 'application/gzip',
        bytes: (async function* () {
          yield dumpBytes;
        })(),
      },
    });

    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({ ...input(), filename: imported.filename });
    expect(await pages.findOne({ siteId, _id: pageId })).toMatchObject({
      title: 'Dump original', createdBy: 'local-author', accessGroupId: 'local-group',
    });
    expect(await readFile(path.join(root, 'media', 'example.test', 'files', 'document.bin')))
      .toEqual(Buffer.from([0, 1, 255, 42]));
    await expect(readFile(path.join(root, 'media', 'example.test', 'files', 'extra.txt')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(await connection.db!.collection('rendering_elements').countDocuments({
      siteId, key: { $in: ['77', 'Legacy'] },
    })).toBe(2);
    expect(await readFile(path.join(root, 'sites', 'Example', 'elements', 'snippets', 'File Snippet.json'), 'utf8'))
      .toContain('file-snippet');
    expect((await connection.db!.collection('active_publications').findOne({ siteId }))?.releaseId).toBe(releaseId);
    expect(await readFile(path.join(settings().artifactsRoot, 'sites', 'example.test', releaseId,
      'public', 'home', 'index.html'), 'utf8')).toContain('Dump original');
    expect((await local.get<IPublicationStorePort>(PUBLICATION_STORE).read(siteId, releaseId))?.releaseId)
      .toBe(releaseId);
    const records = connection.db!.collection('synthetic_records');

    expect((await records.findOne({ siteId }, { promoteLongs: false }))?.exact.toString())
      .toBe('9223372036854775807');
    const sites = connection.db!.collection<mongo.Document & { _id: string }>('sites');

    expect(await sites.countDocuments({ _id: otherId })).toBe(1);
    expect((await records.findOne({ siteId: otherId }, { promoteLongs: false }))?.exact.toString())
      .toBe('9007199254740993');
  });

  it('rejects foreign sites, corrupt gzip, traversal and foreign documents before changing live state', async () => {
    const store = local.get<FileSiteDumpStore>(SITE_DUMP_STORE);
    const content = (bytes: Buffer): { byteSize: number; mimeType: string; bytes: AsyncIterable<Buffer> } => ({
      byteSize: bytes.length,
      mimeType: 'application/gzip',
      bytes: (async function* () {
        yield bytes;
      })(),
    });

    await expect(store.import(otherId, content(dumpBytes))).rejects.toMatchObject({ code: 'Validation' });
    await expect(store.import(siteId, content(dumpBytes.subarray(0, -10))))
      .rejects.toMatchObject({ code: 'Validation' });
    const rows = gunzipSync(dumpBytes).toString().trim().split('\n').map((line) => object(JSON.parse(line)));

    rows.pop();
    const file = rows.find((row) => row.kind === 'file');

    file!.path = '../escape.txt';
    const tampered = path.join(root, 'tampered.gz');

    await writeDumpRecords(tampered, (async function* () {
      yield* rows;
    })());
    await expect(store.import(siteId, content(await readFile(tampered)))).rejects.toMatchObject({ code: 'Validation' });
    expect((await connection.db!.collection<mongo.Document & { _id: string }>('pages')
      .findOne({ siteId, _id: pageId }))?.title).toBe('Dump original');
  });

  it('rolls files back when replacement fails after directory swaps, retaining the current database', async () => {
    const db = new DumpDatabase(connection);
    const failing = new FileSiteDumpStore(settings(), db);
    const spy = vi.spyOn(db, 'replace').mockImplementation(async (_site, _file, _before, swap) => {
      await swap();
      throw new Error('synthetic transaction failure');
    });

    await writeFile(path.join(root, 'media', 'example.test', 'files', 'document.bin'), 'current before failure');
    await expect(failing.restore(siteId, filename)).rejects.toThrow('synthetic transaction failure');
    expect(await readFile(path.join(root, 'media', 'example.test', 'files', 'document.bin'), 'utf8'))
      .toBe('current before failure');
    expect((await connection.db!.collection<mongo.Document & { _id: string }>('pages')
      .findOne({ siteId, _id: pageId }))?.title).toBe('Dump original');
    expect((await readdir(settings().root)).includes('.restore-journal.json')).toBe(false);
    spy.mockRestore();
  });

  it('reconciles an acknowledged commit whose response was lost', async () => {
    await local.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title: 'Before lost response' });
    const db = new DumpDatabase(connection);
    const replace = db.replace.bind(db);
    const store = new FileSiteDumpStore(settings(), db);
    const spy = vi.spyOn(db, 'replace').mockImplementation(async (...args) => {
      await replace(...args);
      throw new Error('synthetic lost commit response');
    });

    await store.restore(siteId, filename);
    expect((await connection.db!.collection<mongo.Document & { _id: string }>('pages')
      .findOne({ siteId, _id: pageId }))?.title).toBe('Dump original');
    spy.mockRestore();
  });

  it('recovers an interrupted swap on bootstrap and keeps recovery idempotent', async () => {
    const db = new DumpDatabase(connection);
    const before = await db.capture(siteId, path.join(root, 'recovery-before.jsonl'));
    const id = randomUUID();
    const staged = '.restore-' + id + '-new';
    const previous = '.restore-' + id + '-old';
    const swaps = [{ root: settings().mediaRoot, target: 'example.test', staged, previous, hadOriginal: true }];

    await writeFile(path.join(settings().mediaRoot, 'example.test', 'files', 'document.bin'),
      'before interrupted swap');
    await mkdir(path.join(settings().mediaRoot, staged));
    await applySwaps(swaps);
    await writeFile(path.join(settings().root, '.restore-journal.json'), JSON.stringify({
      siteId, before: before.fingerprint, after: 'a'.repeat(64), swaps,
    }));
    const store = new FileSiteDumpStore(settings(), db);

    await store.recover();
    await store.recover();
    expect(await readFile(path.join(settings().mediaRoot, 'example.test', 'files', 'document.bin'), 'utf8'))
      .toBe('before interrupted swap');
  });

  it('reads the catalogue from disk and silently removes disappeared entries', async () => {
    const list = local.get<IListSiteDumps>(LIST_SITE_DUMPS);

    expect((await list.execute(input())).some((row) => row.filename === filename)).toBe(true);
    await rm(path.join(settings().root, siteId, filename));
    expect((await list.execute(input())).some((row) => row.filename === filename)).toBe(false);
  });
  it('restores legacy source-key archives and converts their verified releases to the current domain', async () => {
    const rows = gunzipSync(dumpBytes).toString('utf8').trim().split('\n').map((line) => object(JSON.parse(line)));

    rows.pop();
    const layout = object(rows[0]!.layout);

    if (!Array.isArray(layout.artifactDirectories)) {
      throw new Error('Missing publication directories');
    }
    rows[0]!.layout = {
      ...layout,
      artifactDirectories: layout.artifactDirectories.map((directory: unknown) =>
        String(directory).replace('sites/example.test/' + releaseId, 'sites/Example/' + releaseId)),
    };

    for (const row of rows) {
      if (row.area === 'artifacts' && typeof row.path === 'string') {
        row.path = row.path.replace('sites/example.test/' + releaseId + '/', 'sites/Example/' + releaseId + '/');
      }
    }
    const legacy = path.join(root, 'legacy-layout.gz');

    await writeDumpRecords(legacy, (async function* () {
      yield* rows;
    })());
    const bytes = await readFile(legacy);
    const imported = await local.get<IImportSiteDump>(IMPORT_SITE_DUMP).execute({
      ...input(),
      content: {
        mimeType: 'application/gzip',
        byteSize: bytes.length,
        bytes: (async function* () {
          yield bytes;
        })(),
      },
    });

    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({ ...input(), filename: imported.filename });
    const store = local.get<IPublicationStorePort>(PUBLICATION_STORE);
    const release = await store.read(siteId, releaseId);

    expect(release?.releaseId).toBe(releaseId);

    if (!release) {
      throw new Error('Missing restored release');
    }

    const directories = new PublicationDirectoryAdapter(settings().artifactsRoot, {
      primaryDomain: async () => 'example.test',
    });

    await directories.migrate(release);
    expect((await store.read(siteId, releaseId))?.manifest).toEqual(release.manifest);
    expect(await readFile(path.join(settings().artifactsRoot, 'sites/example.test', releaseId,
      'public/home/index.html'), 'utf8')).toContain('Dump original');
  });

});
