import 'reflect-metadata';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import type { CmsApiService } from '../../src/app/services/cms/cms-api.service.js';
import { type ISiteDump, type ISiteDumpApplication, SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import { ImageUploadMode, MediaRoot } from '../../src/domain/media/file-library.js';
import { MediaSortField } from '../../src/domain/media/media-browser.js';
import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON } from '../../src/infra/addons/addons.tokens.js';
import { CMS_API } from '../../src/infra/cms/cms.tokens.js';
import { CREATE_SITE_DUMP, GET_SITE_DUMP, IMPORT_SITE_DUMP, INSPECT_SITE_DUMP, RESTORE_SITE_DUMP }
  from '../../src/infra/dumps/dumps.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { FILE_LIBRARY_OPERATIONS } from '../../src/infra/media/media.tokens.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IEnableSiteAddon } from '../../src/ports/inbound/addons/enable-site-addon.port.js';
import type { ICreateSiteDump, IGetSiteDump, IImportSiteDump, IInspectSiteDump, IRestoreSiteDump }
  from '../../src/ports/inbound/dumps/site-dumps.port.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { siteInput } from '../support/sites.js';

describe('portable add-on packages and data', () => {
  const databases = [0, 1].map(() => 'zarya_test_' + randomUUID().replaceAll('-', ''));
  const connections: Connection[] = [];
  const apps: INestApplicationContext[] = [];
  const sites: string[] = [];
  const pages: string[] = [];
  let mediaIds: readonly string[];
  const actorId = 'package-test';
  let root: string;
  let packageDirectory: string;
  const key = 'synthetic-transfer';
  const collection = 'synthetic_transfer_rows';
  const parts = { configuration: true, businessData: true, package: true };
  const definition = {
    addonKey: key,
    name: { en: 'Synthetic', ru: 'Synthetic' },
    description: { en: 'Test only', ru: 'Test only' },
    contractVersion: 1,
    implementationVersion: '1.0.0',
    configurationSchemaVersion: 1,
    adminComponentId: 'synthetic',
    snippetIds: [],
  };

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    root = await mkdtemp(path.resolve('.tmp/addon-dumps-'));

    for (const [index, database] of databases.entries()) {
      const connection = await createConnection(mongoUri, {
        dbName: database,
        autoIndex: false,
        autoCreate: false,
      }).asPromise();

      connections.push(connection);
      await applyMigrations(connection, 'migrations');
      const app = await createLocalApplication({
        mongoUri,
        database,
        dumpsRoot: path.join(root, String(index), 'dumps'),
        media: { root: path.join(root, String(index), 'media'), publicBaseUrl: '/assets' },
        rendering: {
          sourcesRoot: path.join(root, String(index), 'sources'),
          artifactsRoot: path.join(root, String(index), 'artifacts'),
        },
        operator: { operatorId: actorId, platformAdministrator: true },
      });

      apps.push(app);
      const siteId = (await app.get<ICreateSite>(CREATE_SITE).execute({
        ...siteInput(),
        mark: 'Synthetic',
        primaryDomain: 'synthetic.test',
      })).siteId;

      sites.push(siteId);
      pages.push((await app.get<ICreatePage>(CREATE_PAGE).execute({
        siteId,
        mark: 'Mapping',
        language: 'EN',
        title: 'Target page',
      })).pageId);
    }
    packageDirectory = path.join(root, 'package');
    await mkdir(path.join(packageDirectory, 'migrations'), { recursive: true });
    const files: Record<string, string> = {};
    const logo = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#344455' } }).png().toBuffer();
    const contents = {
      'server.cjs': `exports.validateConfiguration = () => {};
exports.defaultConfiguration = () => ({ schemaVersion: 1, values: {} });
exports.createRuntime = (host) => ({
  cms: { version: 1, objects: { probe: {
    getPage: { kind: 'Query', access: 'PublicEnabled', execute: async (input, context) =>
      context.cms.pages.get({ pageId: input.pageId }) },
    hostPage: { kind: 'Query', access: 'PublicEnabled', execute: async (input, context) =>
      (await host.cms.forSite(context.siteId)).pages.get({ pageId: input.pageId }) },
    uploadLogo: { kind: 'Command', access: 'BackgroundEnabled', execute: async (_input, context) => {
      const client = await host.cms.forSite(context.siteId, 'BackgroundEnabled');
      const png = Buffer.from(${JSON.stringify(logo.toString('base64'))}, 'base64');
      const result = await client.files.uploadFile({
        filename: 'logo.png', folderId: null, mode: 'Original', idempotencyKey: 'logo',
        content: { byteSize: png.length, mimeType: 'image/png', bytes: (async function* () { yield png; })() }
      });
      const permit = await host.policy().authorize(context.siteId, 'BackgroundEnabled');
      const session = await host.connection.startSession();
      try {
        await session.withTransaction(async () => {
          await host.fence.check(permit, session, [result.fileId]);
          await host.connection.db.collection('${collection}').updateOne(
            { siteId: context.siteId, _id: 'original-row' }, { $set: { fileId: result.fileId } }, { session });
        });
      } finally {
        await session.endSession();
      }
      return result.fileId;
    } }
  } } },
  canHandle: (url) => url === '/api/synthetic-transfer',
  handle: async (request, response) => {
    const siteId = new URL(request.url, 'http://localhost').searchParams.get('site');
    await host.policy('${key}').authorize(siteId, 'PublicEnabled');
    const rows = await host.connection.db.collection('${collection}').find({ siteId }).toArray();
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(rows));
  }
});`,
      'admin.js': 'export function mount(target, host) { target.textContent = host.siteId; return { update() {}, destroy() {} }; }',
      'admin.css': '.synthetic { display: block; }',
      'migrations/0000-runtime.json': JSON.stringify({
        id: '0000-runtime',
        collections: [{
          name: collection,
          validator: {
            $and: [{
              $jsonSchema: {
                bsonType: 'object',
                required: ['_id', 'siteId', 'pageId'],
                properties: {
                  _id: { bsonType: 'string' },
                  siteId: { bsonType: 'string' },
                  pageId: { bsonType: 'string' },
                },
              },
            }, { $or: [{ fileRequired: { $ne: true } }, { fileId: { $exists: true } }] }],
          },
          indexes: [{ key: { siteId: 1, pageId: 1 }, name: 'site_page', unique: true }],
        }],
      }),
    };

    for (const [name, content] of Object.entries(contents)) {
      await writeFile(path.join(packageDirectory, name), content);
      files[name] = createHash('sha256').update(content).digest('hex');
    }
    await writeFile(path.join(packageDirectory, 'addon.runtime.json'), JSON.stringify({
      format: 'zarya-addon',
      version: 1,
      definition,
      collections: [{
        name: collection,
        references: [
          { path: 'pageId', collection: 'pages' }, { path: 'fileId', collection: 'media_files' },
        ],
      }],
      files,
      serverEntry: 'server.cjs',
      adminEntry: 'admin.js',
      styles: ['admin.css'],
      dependencies: {},
    }));
    await apps[0]!.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).install(packageDirectory);
    await apps[0]!.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
      siteId: sites[0]!,
      actorId,
      addonKey: key,
      expectedVersion: null,
      configuration: { schemaVersion: 1, values: { transferred: true } },
    });
    await connections[0]!.db!.collection<{ _id: string; [key: string]: unknown }>(collection).insertOne({
      _id: 'original-row',
      siteId: sites[0],
      pageId: pages[0],
      amount: 123,
      version: 'source-version',
    });
    const source = apps[0]!.get<CmsApiService>(CMS_API).forContext({ siteId: sites[0]!, actorId });
    const target = apps[1]!.get<CmsApiService>(CMS_API).forContext({ siteId: sites[1]!, actorId });
    const sourceId = await source.extensions[key]!.probe!.uploadLogo!({});
    const targetLogo = await sharp({ create: { width: 5, height: 6, channels: 3, background: '#654321' } })
      .png().toBuffer();
    const targetFile = await target.files.uploadFile({
      filename: 'logo.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      idempotencyKey: 'target',
      content: {
        byteSize: targetLogo.length,
        mimeType: 'image/png',
        bytes: (async function* () {
          yield targetLogo;
        })(),
      },
    });

    if (typeof sourceId !== 'string') {
      throw new Error('Installed add-on returned no file identity');
    }
    mediaIds = [sourceId, targetFile.fileId];
  });

  afterAll(async () => {
    for (const app of apps) {
      await app.close();
    }

    for (const connection of connections) {
      try {
        if (!databases.includes(connection.name) || !/^zarya_test_[a-f0-9]{32}$/.test(connection.name)) {
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

  function create(): Promise<ISiteDump> {
    return apps[0]!.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute({
      siteId: sites[0]!,
      actorId,
      options: { type: SiteDumpType.Addons, itemIds: [key], addonParts: parts },
    });
  }

  async function upload(filename?: string): Promise<string> {
    const archive = filename ?? (await create()).filename;
    const downloaded = await apps[0]!.get<IGetSiteDump>(GET_SITE_DUMP).execute({
      siteId: sites[0]!,
      actorId,
      filename: archive,
    });
    const chunks = [];

    for await (const bytes of downloaded.content.bytes) {
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    const result = await apps[1]!.get<IImportSiteDump>(IMPORT_SITE_DUMP).execute({
      siteId: sites[1]!,
      actorId,
      content: {
        byteSize: bytes.length,
        mimeType: 'application/gzip',
        bytes: (async function* () {
          yield bytes;
        })(),
      },
    });

    return result.filename;
  }

  it('registers scoped CMS extensions from an installed runtime package', async () => {
    const cms = apps[0]!.get<CmsApiService>(CMS_API).forContext({ siteId: sites[0]!, actorId });

    expect(await cms.extensions[key]!.probe!.getPage!({ pageId: pages[0]! })).toMatchObject({
      pageId: pages[0]!,
      siteId: sites[0]!,
    });
    expect(await cms.extensions[key]!.probe!.hostPage!({ pageId: pages[0]! })).toMatchObject({ pageId: pages[0]! });
    expect(await cms.extensions[key]!.probe!.getPage!({ pageId: pages[1]! })).toBeNull();
    await expect(cms.extensions[key]!.probe!.getPage!({ pageId: pages[0]!, siteId: sites[1]! })).rejects.toThrow();
    expect(await cms.extensions[key]!.probe!.uploadLogo!({})).toBe(mediaIds[0]);
    const files = await cms.files.browse({
      root: MediaRoot.Images,
      folderId: null,
      search: '',
      recursive: false,
      sort: MediaSortField.Name,
      descending: false,
      page: 1,
      pageSize: 25,
    });
    const usages = await cms.files.usages({ fileId: mediaIds[0]!, expectedVersion: files.version });

    expect(usages.usages).toEqual(expect.arrayContaining([expect.objectContaining({
      field: collection + '.fileId',
      editorPath: '/admin/sites/' + sites[0] + '/addons/' + key,
    })]));
    await expect(cms.files.delete({
      fileId: mediaIds[0]!, expectedVersion: files.version, force: false,
    })).rejects.toMatchObject({ code: 'Conflict' });
  });

  it('inspects without execution and installs a running API with mapped data and admin assets', async () => {
    const previousPublication = await connections[1]!.db!.collection('active_publications')
      .findOne({ siteId: sites[1] });
    const registry = apps[1]!.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);
    const filename = await upload();
    const input = { siteId: sites[1]!, actorId, filename };
    const review = await apps[1]!.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute(input);

    expect(registry.handler('/api/synthetic-transfer')).toBeNull();
    expect(review.pages).toEqual([{ pageId: pages[0], title: 'Target page' }]);
    await expect(apps[1]!.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      ...input,
      options: { version: review.version, choices: [{ id: key, targetId: null }], addonParts: parts },
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(registry.handler('/api/synthetic-transfer')).toBeNull();
    await apps[1]!.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      ...input,
      options: {
        version: review.version,
        choices: [{ id: key, targetId: null }],
        addonParts: parts,
        pageMappings: { [pages[0]!]: pages[1]! },
      },
    });
    const installed = registry.view(key);

    expect(installed?.entry).toBe('admin.js');
    const asset = await registry.read(key, installed!.digest, 'admin.js');
    const assetBytes = [];

    for await (const bytes of asset.bytes) {
      assetBytes.push(bytes);
    }
    expect(Buffer.concat(assetBytes).toString()).toContain('export function mount');
    await expect(registry.asset(key, installed!.digest, 'server.cjs')).rejects.toMatchObject({ code: 'NotFound' });
    const server = createServer((request, response) => {
      const handler = registry.handler(new URL(request.url ?? '/', 'http://localhost').pathname);

      if (!handler) {
        response.writeHead(404).end();

        return;
      }
      void handler.handle(request, response).catch(() => response.writeHead(500).end());
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Missing test server');
      }

      const response = await fetch('http://127.0.0.1:' + address.port + '/api/synthetic-transfer?site=' + sites[1]);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([expect.objectContaining({
        siteId: sites[1],
        pageId: pages[1],
        amount: 123,
        fileId: mediaIds[1],
      })]);
      expect(await connections[1]!.db!.collection<{ _id: string }>(collection)
        .findOne({ _id: 'original-row' })).toBeNull();
      expect(await connections[1]!.db!.collection('site_addons').findOne({ siteId: sites[1], addonKey: key }))
        .toMatchObject({ configuration: { schemaVersion: 1, values: { transferred: true } } });
      expect(await connections[1]!.db!.collection('active_publications').findOne({ siteId: sites[1] }))
        .toEqual(previousPublication);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('restores same-site links after a logo replacement and reports references to force-deleted files', async () => {
    const [source, target] = [0, 1].map((index) => ({ siteId: sites[index]!, actorId }));
    const sourceFiles = apps[0]!.get<IFileLibraryOperations>(FILE_LIBRARY_OPERATIONS);
    const sourceRows = connections[0]!.db!.collection<{ _id: string; fileId?: string }>(collection);
    const snapshot = await create();
    const scoped = await sourceFiles.browse.file({ siteId: source!.siteId, fileId: mediaIds[0]! });
    const changed = await sharp({ create: { width: 7, height: 9, channels: 3, background: '#567811' } })
      .png().toBuffer();
    const logo = await sourceFiles.changeImage.execute({
      ...source!,
      fileId: scoped.fileId,
      expectedVersion: (await sourceFiles.list.execute(source!)).version,
      filename: 'replacement.png',
      content: assetBinary(changed, 'image/png'),
    });

    expect(logo.files[0]?.outputs[0]?.url).toBe(scoped.outputs[0]?.url);
    expect(logo.files[0]?.assetVersion).not.toBe(scoped.assetVersion);
    const sameSite = async (filename: string, unresolved = 0): Promise<void> => {
      const input = { ...source!, filename };
      const review = await apps[0]!.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute(input);

      expect(review.items[0]?.unresolvedFileReferences ?? 0).toBe(unresolved);
      expect(review.allowFileOmission).toBe(false);
      await apps[0]!.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
        ...input,
        options: {
          ...options(review.version, review.items[0]!.targetId!, pages[0]!),
          addonParts: { ...parts, package: false },
        },
      });
    };

    await sameSite(snapshot.filename);
    expect((await sourceFiles.browse.file({ siteId: source!.siteId, fileId: scoped.fileId })).assetVersion)
      .toBe(logo.files[0]?.assetVersion);
    expect((await sourceRows.findOne({ _id: 'original-row' }))?.fileId).toBe(scoped.fileId);

    const missing = await sourceFiles.upload.execute({
      ...source!,
      filename: 'removed.png',
      folderId: null,
      content: assetBinary(changed, 'image/png'),
      mode: ImageUploadMode.Original,
      expectedVersion: (await sourceFiles.list.execute(source!)).version,
    });
    const missingId = missing.files[0]!.fileId;
    const sourcePage = (await apps[0]!.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: source!.siteId, mark: 'SecondMapping', language: 'EN', title: 'Second page',
    })).pageId;
    const targetPage = (await apps[1]!.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: target!.siteId, mark: 'SecondMapping', language: 'EN', title: 'Second page',
    })).pageId;
    const sourceData = connections[0]!.db!.collection<{ _id: string; [field: string]: unknown }>(collection);

    await sourceData.insertOne({
      _id: 'dangling-row', siteId: source!.siteId, pageId: sourcePage, fileId: missingId, amount: 987,
    });
    await sourceFiles.delete.execute({ siteId: source!.siteId, fileId: missingId, force: true });
    const dump = await create();

    expect(dump.missingFileReferences).toBe(1);
    expect((await sourceRows.findOne({ _id: 'dangling-row' }))?.fileId).toBe(missingId);
    const input = { ...target!, filename: await upload(dump.filename) };
    const review = await apps[1]!.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute(input);
    const selected = options(review.version, review.items[0]!.targetId!, pages[1]!);

    expect(review.items[0]?.unresolvedFileReferences).toBe(1);
    expect(review.allowFileOmission).toBe(true);
    const restore = apps[1]!.get<IRestoreSiteDump>(RESTORE_SITE_DUMP);
    const restoreOptions = {
      ...selected,
      addonParts: { ...parts, package: false },
      pageMappings: { ...selected.pageMappings, [sourcePage]: targetPage },
    };

    await expect(restore.execute({ ...input, options: restoreOptions })).rejects.toMatchObject({ code: 'Validation' });
    await restore.execute({ ...input, options: { ...restoreOptions, omitUnresolvedFiles: true } });
    const targetRows = connections[1]!.db!.collection(collection);

    expect(await targetRows.findOne({ amount: 123 })).toMatchObject({ fileId: mediaIds[1] });
    const restored = await targetRows.findOne({ amount: 987 });

    expect(restored?.pageId).toBe(targetPage);
    expect(restored).not.toHaveProperty('fileId');
    const sourceReview = await apps[0]!.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute({
      ...source!, filename: dump.filename,
    });

    await apps[0]!.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      ...source!,
      filename: dump.filename,
      options: {
        ...options(sourceReview.version, sourceReview.items[0]!.targetId!, pages[0]!),
        addonParts: { ...parts, package: false },
        pageMappings: { [pages[0]!]: pages[0]!, [sourcePage]: sourcePage },
      },
    });
    expect(sourceReview.items[0]?.unresolvedFileReferences).toBe(1);
    expect((await sourceRows.findOne({ _id: 'dangling-row' }))?.fileId).toBe(missingId);

    await sourceData.updateOne({ _id: 'dangling-row' }, { $set: { fileRequired: true } });
    const required = { ...target!, filename: await upload() };
    const requiredReview = await apps[1]!.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute(required);

    await expect(restore.execute({
      ...required,
      options: { ...restoreOptions, version: requiredReview.version, omitUnresolvedFiles: true },
    })).rejects.toMatchObject({ code: 'Validation', message: 'Add-on data requires a file reference' });
    expect(await targetRows.findOne({ amount: 987 })).toEqual(restored);
  });

  function options(version: string, targetId: string, pageId: string): ISiteDumpApplication {
    return { version, choices: [{ id: key, targetId }], pageMappings: { [pages[0]!]: pageId } };
  }

  it('rejects invalid CMS extension names without acknowledging an installation', async () => {
    const directory = path.join(root, 'invalid-cms-package');

    await mkdir(path.join(directory, 'migrations'), { recursive: true });
    const source = 'exports.validateConfiguration = () => {}; '
      + 'exports.defaultConfiguration = () => ({schemaVersion:1,values:{}}); '
      + 'exports.createRuntime = () => ({cms:{version:1,objects:{constructor:{get:{'
      + 'kind:"Query",access:"PublicEnabled",execute:async()=>null}}}},'
      + 'canHandle:()=>false,handle:async()=>{throw new Error("No routes")}});';
    const migration = JSON.stringify({ id: '0000-runtime', collections: [] });

    await writeFile(path.join(directory, 'server.cjs'), source);
    await writeFile(path.join(directory, 'migrations/0000-runtime.json'), migration);
    const invalidKey = 'synthetic-invalid-api';

    await writeFile(path.join(directory, 'addon.runtime.json'), JSON.stringify({
      format: 'zarya-addon',
      version: 1,
      definition: { ...definition, addonKey: invalidKey },
      collections: [],
      serverEntry: 'server.cjs',
      adminEntry: null,
      styles: [],
      dependencies: {},
      files: {
        'server.cjs': createHash('sha256').update(source).digest('hex'),
        'migrations/0000-runtime.json': createHash('sha256').update(migration).digest('hex'),
      },
    }));
    const registry = apps[0]!.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);

    await expect(registry.install(directory)).rejects.toThrow();
    expect(registry.registrations().map((item) => item.definition.addonKey)).not.toContain(invalidKey);
    await expect(readFile(path.join(root, '0/dumps/.installed-addons', invalidKey + '.json'))).rejects.toThrow();
  });

  it('rejects modified packages before evaluating server code', async () => {
    const filename = path.join(packageDirectory, 'server.cjs');
    const original = await readFile(filename);

    await writeFile(filename, 'throw new Error("must never execute");');

    try {
      await expect(apps[1]!.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).install(packageDirectory))
        .rejects.toThrow('Package checksum mismatch');
    } finally {
      await writeFile(filename, original);
    }
  });

  it('reloads the installed package from private filesystem registration on a new application context', async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    await apps[1]!.close();
    apps[1] = await createLocalApplication({
      mongoUri,
      database: databases[1]!,
      dumpsRoot: path.join(root, '1', 'dumps'),
      rendering: { sourcesRoot: path.join(root, '1', 'sources'), artifactsRoot: path.join(root, '1', 'artifacts') },
      operator: { operatorId: actorId, platformAdministrator: true },
    });
    expect(apps[1].get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).handler('/api/synthetic-transfer')).not.toBeNull();
  });
});
