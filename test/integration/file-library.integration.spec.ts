import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

import { createCloudflareWorker } from '../../src/adapters/inbound/gateway/cloudflare/worker.js';
import {
  MediaReferenceUpdatesAdapter,
} from '../../src/adapters/outbound/media/references/media-reference-updates.adapter.js';
import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { fileRecord, mediaRecords, MongooseFileLibraryStore }
  from '../../src/adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import type {
  FileAssetStorageAdapter,
} from '../../src/adapters/outbound/storage/files/media/asset-storage.adapter.js';
import type {
  FileLibraryProjectionAdapter,
} from '../../src/adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import type { CmsApiService } from '../../src/app/services/cms/cms-api.service.js';
import type { RequestDocumentCacheService } from '../../src/app/services/publication/request-document-cache.service.js';
import {
  PublishMediaAddressReleaseUseCase,
} from '../../src/app/use-cases/publication/publish-media-address-release.use-case.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { ImageUploadMode, type IMediaLibraryView, MediaRoot } from '../../src/domain/media/file-library.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import type { IBinaryContent } from '../../src/domain/shared/binary-content.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import { AppModule } from '../../src/infra/app.module.js';
import { CMS_API } from '../../src/infra/cms/cms.tokens.js';
import {
  ASSET_STORAGE, FILE_LIBRARY_OPERATIONS, FILE_LIBRARY_PROJECTION,
  FILE_LIBRARY_STORE,
} from '../../src/infra/media/media.tokens.js';
import { migrateMediaLayout } from '../../src/infra/media/migrate-media-layout.js';
import { GET_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import type { IPublicHttpSettings } from '../../src/infra/public-http.settings.js';
import { PUBLISH_PAGE } from '../../src/infra/publication/publication.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION,
  REQUEST_DOCUMENT_CACHE,
} from '../../src/infra/publication/publication.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE, UPDATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { TV_OPERATIONS } from '../../src/infra/template-variables/template-variables.tokens.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IUpdateSite } from '../../src/ports/inbound/sites/update-site.port.js';
import type {
  ITemplateVariableOperations,
} from '../../src/ports/inbound/template-variables/template-variables.port.js';
import type { IMediaLibraryStore } from '../../src/ports/outbound/media/file-library.port.js';
import type { IDataLoader } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { verifyScrollShadow } from '../support/admin-scroll.js';
import { account } from '../support/admin-users.js';
import { icoFixture } from '../support/favicon.js';
import { xlsxFixture } from '../support/office-documents.js';
import { siteInput } from '../support/sites.js';

describe('Files through real composition, storage, HTTP and the built admin', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const password = 'synthetic file library password';
  let connection: Connection;
  let local: INestApplicationContext;
  let app: INestApplication<Server>;
  let httpSettings: IPublicHttpSettings;
  let root: string;
  let siteId: string;
  let otherSiteId: string;
  let operations: IFileLibraryOperations;
  let origin: string;
  let cookie: string;
  let buildReads = 0;
  const loaders: IDataLoader[] = [{
    id: 'FrozenMediaLabel',
    parameters: [],
    output: { name: 'value', kind: ParameterKind.String, required: true },
    phases: [LoaderPhase.Build],
    read: async () => {
      buildReads++;

      return 'Frozen Build value';
    },
  }];

  async function command(route: string, body: unknown, session = cookie): Promise<Response> {
    if (body !== null && typeof body === 'object' && 'base64' in body && typeof body.base64 === 'string') {
      const { base64, ...metadata } = body;

      return fetch(origin + route, {
        method: 'POST',
        headers: {
          Origin: origin,
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/octet-stream',
          'X-Zarya-File-Metadata': encodeURIComponent(JSON.stringify(metadata)),
          Cookie: session,
        },
        body: Buffer.from(base64, 'base64'),
      });
    }

    return fetch(origin + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        Cookie: session,
      },
      body: JSON.stringify(body),
    });
  }

  async function png(width = 1000, height = 400, background = '#f005'): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
  }

  async function publicGet(url: string, hostname: string): Promise<{ status: number; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(origin + url, { headers: { Host: hostname } }, (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) }));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.end();
    });
  }

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/files-integration-'));
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    const sourcesRoot = path.join(root, 'sites');
    const artifactsRoot = path.join(root, 'artifacts');
    const media = { root: path.join(root, 'data'), publicBaseUrl: '/assets' };

    await mkdir(sourcesRoot, { recursive: true });
    local = await NestFactory.createApplicationContext(AppModule.forLocalOperator({
      backgroundWork: false,
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      media,
      rendering: { sourcesRoot, artifactsRoot, loaders },
    }),
    { logger: false, abortOnError: false });
    const sites = local.get<ICreateSite>(CREATE_SITE);

    siteId = (await sites.execute({ ...siteInput(), primaryDomain: '127.0.0.1' })).siteId;
    otherSiteId = (await sites.execute({ ...siteInput(), mark: 'Other', primaryDomain: 'other.test' })).siteId;
    operations = local.get(FILE_LIBRARY_OPERATIONS);
    const users = new MongooseAdminUserStore(connection);
    const digest = await new ScryptAdminPasswordAdapter().hash(password);

    await users.run(async (work) => {
      await work.save(new AdminUser({ ...account('files-admin').toState(), passwordDigest: digest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    origin = 'http://127.0.0.1:' + address.port;
    httpSettings = {
      backgroundWork: false,
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      artifactsRoot,
      sourcesRoot,
      loaders,
      media,
      adminAuth: { origin },
      edgeProxySecret: 'synthetic-edge-secret',
      adminRoot: path.resolve('admin/dist'),
    };
    app = await createPublicHttpApplication(httpSettings);
    const login = await command('/api/admin/auth/login', { email: 'files-admin@example.test', password }, '');

    expect(login.status).toBe(200);
    cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  });

  afterAll(async () => {
    await app?.close();
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
    if (root?.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces a private favicon through authenticated HTTP without publishing or exposing it in Files', async () => {
    const route = '/api/admin/sites/' + siteId + '/favicon';
    const first = await icoFixture(32);
    const second = await icoFixture(64);
    const upload = (bytes: Buffer, filename = 'favicon.ico', session = cookie): Promise<Response> =>
      command(route, { filename, base64: bytes.toString('base64') }, session);
    const initial = await fetch(origin + route, { headers: { Cookie: cookie, 'X-Zarya-Admin': '1' } });

    expect(await initial.json()).toEqual({ favicon: null });
    expect((await upload(first, 'favicon.ico', '')).status).toBe(401);
    expect((await upload(first, 'image.png')).status).toBe(400);
    expect((await upload(Buffer.from('fake ico'))).status).toBe(400);
    const response = await upload(first);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ favicon: { byteSize: first.length, width: 32, height: 32 } });
    const publicIcon = await fetch(origin + '/favicon.ico');
    const etag = publicIcon.headers.get('etag');

    expect(publicIcon.status).toBe(200);
    expect(publicIcon.headers.get('content-type')).toBe('image/x-icon');
    expect(publicIcon.headers.get('cache-control')).toContain('must-revalidate');
    expect(Buffer.from(await publicIcon.arrayBuffer())).toEqual(first);
    expect((await publicGet('/favicon.ico', 'other.test')).status).toBe(404);
    expect((await publicGet('/favicon.ico', 'unknown.test')).status).toBe(404);
    expect((await publicGet('/assets/images/favicon.ico', '127.0.0.1')).status).toBe(404);
    const head = await fetch(origin + '/favicon.ico', { method: 'HEAD' });

    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(first.length));
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect((await fetch(origin + '/favicon.ico', { headers: { 'If-None-Match': etag! } })).status).toBe(304);
    expect((await upload(second)).status).toBe(200);
    const changed = await fetch(origin + '/favicon.ico', { headers: { 'If-None-Match': etag! } });

    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
    expect(Buffer.from(await changed.arrayBuffer())).toEqual(second);
    expect((await upload(Buffer.from('broken replacement'))).status).toBe(400);
    expect((await publicGet('/favicon.ico', '127.0.0.1')).body).toEqual(second);
    const library = await operations.list.execute({ siteId });

    expect(library.files.some((file) => file.name === 'favicon.ico')).toBe(false);
    expect(await readFile(path.join(root, 'data', '127.0.0.1', '.private', 'favicon.ico'))).toEqual(second);
  });

  it('uploads and serves WOFF2 through file library and public HTTP', async () => {
    const bytes = Buffer.alloc(48);

    bytes.write('wOF2');
    bytes.writeUInt32BE(0x00010000, 4);
    bytes.writeUInt32BE(bytes.length, 8);
    const catalog = await operations.list.execute({ siteId });

    await operations.upload.execute({
      siteId,
      expectedVersion: catalog.version,
      filename: 'regular.woff2',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(bytes, 'application/octet-stream'),
    });
    const library = await operations.list.execute({ siteId });
    const font = library.files.find((file) => file.name === 'regular.woff2')!;

    expect(font).toMatchObject({ mimeType: 'font/woff2' });
    expect(font.outputs).toHaveLength(1);
    expect(font.outputs[0]?.dimensions).toBeNull();
    const response = await publicGet('/assets/files/regular.woff2', '127.0.0.1');

    expect(response.status).toBe(200);
    expect(response.body.equals(bytes)).toBe(true);
    const head = await fetch(origin + '/assets/files/regular.woff2', { method: 'HEAD' });

    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('font/woff2');
    expect(await head.text()).toBe('');
    expect((await publicGet('/assets/files/regular.woff2', 'other.test')).status).toBe(404);
  });

  it('rejects an anonymous unfinished large upload and serves streamed document HEAD/304 without a body', async () => {
    for (const endpoint of ['/files', '/favicon/delete']) {
      const anonymous = await new Promise<number>((resolve, reject) => {
        const client = httpRequest(origin + '/api/admin/sites/' + siteId + endpoint, {
          method: 'POST',
          headers: {
            Origin: origin,
            'X-Zarya-Admin': '1',
            'Content-Type': 'application/octet-stream',
            'Content-Length': 64 * 1024 * 1024,
          },
        }, (response) => {
          response.resume();
          response.once('end', () => {
            resolve(response.statusCode ?? 0);
            client.destroy();
          });
        });

        client.once('error', reject);
        client.flushHeaders();
      });

      expect(anonymous).toBe(401);
    }
    const streamSite = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'StreamSecurity', primaryDomain: 'streaming.test',
    })).siteId;
    const uploaded = await command('/api/admin/sites/' + streamSite + '/files', {
      expectedVersion: '0',
      filename: 'streamed.csv',
      folderId: null,
      mode: 'Original',
      base64: Buffer.alloc(2 * 1024 * 1024, 65).toString('base64'),
    });

    expect(uploaded.status).toBe(200);
    const library: IMediaLibraryView = await uploaded.json();
    const url = library.files[0]!.outputs[0]!.url;
    const get = async (method: string, etag?: string): Promise<{ status: number; size: number; etag: string }> =>
      new Promise((resolve, reject) => {
        const client = httpRequest(origin + url, {
          method, headers: { Host: 'streaming.test', ...(etag ? { 'If-None-Match': etag } : {}) },
        }, (response) => {
          let size = 0;

          response.on('data', (chunk: Buffer) => {
            size += chunk.byteLength;
          });
          response.once('end', () => resolve({
            status: response.statusCode ?? 0, size, etag: String(response.headers.etag ?? ''),
          }));
          response.once('error', reject);
        });

        client.once('error', reject);
        client.end();
      });
    const head = await get('HEAD');

    expect(head.status).toBe(200);
    expect(head.size).toBe(0);
    expect(await get('GET', head.etag)).toMatchObject({ status: 304, size: 0 });
    expect(await get('GET')).toMatchObject({ status: 200, size: 2 * 1024 * 1024 });
  });

  it('retains originals and real dimensions and preserves URLs on replacement', async () => {
    let library = await operations.list.execute({ siteId });

    library = await operations.createFolder.execute({
      siteId, expectedVersion: library.version, parentId: null, name: 'Photos',
    });
    const folderId = library.folders[0]!.folderId;
    const original = await png();

    library = await operations.upload.execute({
      siteId,
      expectedVersion: library.version,
      filename: 'photo.png',
      folderId,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(original, 'wrong/type'),
    });
    const file = library.files.find((item) => item.name === 'photo.png' && item.folderId === folderId)!;

    expect(file.hasVariants).toBe(true);
    expect(file.outputs).toHaveLength(6);

    for (const output of file.outputs) {
      const response = await operations.readContent.execute({ siteId, fileId: file.fileId, key: output.key });
      let actualBytes = 0;

      for await (const chunk of response.content.bytes) {
        actualBytes += chunk.byteLength;
      }
      expect(output.byteSize).toBe(actualBytes);
    }
    expect(file.outputs.find((item) => item.key === 'w1200')?.dimensions).toMatchObject({ width: 833, height: 333 });
    const stored = await local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE).read(siteId);
    const storedFile = stored.library.files.find((item) => item.fileId === file.fileId)!;
    const originalPath = path.join(root, 'data/127.0.0.1/.private/objects',
      ...storedFile.image.original.contentId.split('/').slice(2));

    expect(await readFile(originalPath)).toEqual(original);
    const url = file.outputs.at(-1)!.url;
    const publicResponse = await fetch(origin + url);

    expect(publicResponse.status).toBe(200);
    expect(await sharp(Buffer.from(await publicResponse.arrayBuffer())).metadata()).toMatchObject({
      format: 'webp', width: 1000, height: 400,
    });
    const publicPath = path.join(root, 'data/127.0.0.1', decodeURIComponent(url.slice('/assets/'.length)));

    expect(await readFile(publicPath)).toBeInstanceOf(Buffer);
    expect((await operations.list.execute({ siteId: otherSiteId })).files).toEqual([]);
    await expect(operations.readContent.execute({ siteId: otherSiteId, fileId: file.fileId, key: 'original' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    await expect(operations.changeImage.execute({
      siteId,
      expectedVersion: library.version,
      fileId: file.fileId,
      filename: 'broken.png',
      content: assetBinary(Buffer.from('broken'), 'image/png'),
    })).rejects.toThrow();
    const projection = local.get<FileLibraryProjectionAdapter>(FILE_LIBRARY_PROJECTION);
    const install = projection.installChange.bind(projection);
    let entered = (): void => {};
    let release = (): void => {};
    const staged = new Promise<void>((resolve) => entered = resolve);
    const resume = new Promise<void>((resolve) => release = resolve);
    const paused = vi.spyOn(projection, 'installChange').mockImplementationOnce(async (...args) => {
      entered();
      await resume;

      return install(...args);
    });
    const replacement = await png(600, 300, '#0099ff');
    const changing = operations.changeImage.execute({
      siteId,
      expectedVersion: library.version,
      fileId: file.fileId,
      filename: 'entirely-different.png',
      content: assetBinary(replacement, 'image/png'),
    });
    const settled = Promise.allSettled([changing]);

    try {
      await Promise.race([staged, changing]);
      const [head, get] = await Promise.all([fetch(origin + url, { method: 'HEAD' }), fetch(origin + url)]);

      expect(head.status).toBe(200);
      expect(get.status).toBe(200);
      expect(head.headers.get('etag')).toBe(publicResponse.headers.get('etag'));
      expect(get.headers.get('etag')).toBe(publicResponse.headers.get('etag'));
      expect((await sharp(Buffer.from(await get.arrayBuffer())).metadata()).width).toBe(1000);
    } finally {
      release();
      await settled;
      paused.mockRestore();
    }
    const changed = await changing;
    const replaced = changed.files.find((item) => item.fileId === file.fileId)!;

    expect(replaced.outputs.map((item) => item.url)).toEqual(file.outputs.map((item) => item.url));
    expect(replaced.name).toBe('photo.png');
    expect(replaced.createdAt).toBe(file.createdAt);
    expect(replaced.updatedAt).not.toBe(file.updatedAt);
    expect(await operations.browse.file({ siteId, fileId: file.fileId })).toEqual(replaced);

    for (const output of replaced.outputs) {
      const response = await operations.readContent.execute({ siteId, fileId: file.fileId, key: output.key });

      expect(output.byteSize).toBe(response.content.byteSize);
    }
    const updated = await fetch(origin + url, { method: 'HEAD' });

    expect(updated.status).toBe(200);
    expect(updated.headers.get('etag')).not.toBe(publicResponse.headers.get('etag'));
    const response = await operations.readContent.execute({ siteId, fileId: file.fileId, key: 'original' });
    const chunks = [];

    for await (const chunk of response.content.bytes) {
      chunks.push(chunk);
    }
    expect(await sharp(Buffer.concat(chunks)).metadata()).toMatchObject({ width: 600, height: 300 });
    await verifyMigrations(connection, 'migrations');
  });

  it('serves unaffected public bytes during a bulk upload and frees definitively rejected assets', async () => {
    const store = local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE);
    const original = await png(30, 20);
    const upload = async (filename: string): Promise<IMediaLibraryView> => operations.upload.execute({
      siteId,
      filename,
      expectedVersion: (await store.status(siteId)).version,
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(original, 'image/png'),
    });
    const first = await upload('bulk-logo.png');
    const logo = first.files[0]!;
    const url = origin + logo.outputs[0]!.url;
    const head = await fetch(url, { method: 'HEAD' });
    const etag = head.headers.get('etag');
    const assets = connection.collection('assets');
    const before = await assets.countDocuments({ siteId });
    const objects = path.join(root, 'data/127.0.0.1/.private/objects');
    const beforeObjects = await readdir(objects, { recursive: true, withFileTypes: true });
    const rejected = vi.spyOn(store, 'append').mockRejectedValueOnce(
      new BusinessError(BusinessErrorCode.StaleWrite, 'Another writer won'));

    try {
      await expect(upload('discarded.png')).rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
      expect(await assets.countDocuments({ siteId })).toBe(before);
      expect((await readdir(objects, { recursive: true, withFileTypes: true })).filter((item) => item.isFile())
        .map((item) => item.name).sort()).toEqual(beforeObjects.filter((item) => item.isFile())
        .map((item) => item.name).sort());
    } finally {
      rejected.mockRestore();
    }

    const bulk = async (): Promise<void> => {
      for (let index = 0; index < 25; index++) {
        await upload('bulk-' + index + '.png');
      }
    };

    await Promise.all([bulk(), (async () => {
      for (let index = 0; index < 25; index++) {
        const response = await fetch(url, { method: index % 2 === 0 ? 'HEAD' : 'GET' });

        expect(response.status).toBe(200);
        expect(response.headers.get('etag')).toBe(etag);
        await response.arrayBuffer();
      }
    })()]);

    await operations.delete.execute({
      siteId,
      fileId: logo.fileId,
      expectedVersion: (await store.status(siteId)).version,
      force: true,
    });
    expect((await fetch(url, { method: 'HEAD' })).status).toBe(404);
    const recreated = (await upload('bulk-logo.png')).files[0]!;

    expect(recreated.fileId).not.toBe(logo.fileId);
    expect(recreated.outputs[0]!.url).toBe(logo.outputs[0]!.url);
    expect((await fetch(url, { method: 'HEAD' })).status).toBe(200);
  });

  it('uses file revisions for card edits while an importer is uploading other images', async () => {
    const siteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'ConcurrentCard', primaryDomain: 'concurrent-card.test',
    })).siteId;
    const client = local.get<CmsApiService>(CMS_API).forContext({ siteId, actorId: 'importer' });

    using fullCatalogue = vi.spyOn(MongooseFileLibraryStore.prototype, 'read');
    const image = await png(12, 8);
    const content = (): IBinaryContent => assetBinary(image, 'image/png');
    const uploaded = await operations.upload.execute({
      siteId,
      filename: 'original.png',
      expectedVersion: '0',
      folderId: null,
      content: content(),
      mode: ImageUploadMode.Original,
    });
    const opened = uploaded.files[0]!;
    const base = '/api/admin/sites/' + siteId + '/files/' + opened.fileId;
    const scope = { expectedVersion: uploaded.version, expectedFileVersion: opened.revision };
    const { folderId: folder } = await client.files.ensureFolder({
      name: 'Moved', parentId: null, root: MediaRoot.Images,
    });
    const firstImport = client.files.uploadBatch({
      files: Array.from({ length: 12 }, (_, index) => ({
        folderId: null,
        filename: 'import-' + index + '.png',
        idempotencyKey: 'batch-' + index,
        mode: ImageUploadMode.Original,
        content: content(),
      })),
    });
    const swapped = await command(base + '/change', {
      ...scope,
      filename: 'replacement.png',
      base64: (await png(10, 9, '#451321')).toString('base64'),
    });
    const imports = await firstImport;

    expect(imports.every((item) => item.ok)).toBe(true);
    expect(swapped.status).toBe(200);
    const changed: IMediaLibraryView = await swapped.json();
    const sameFile = await command(base + '/move', { ...scope, folderId: null, name: 'stale.png' });

    expect(sameFile.status).toBe(409);
    const moved = await command(base + '/move', {
      ...scope,
      expectedFileVersion: changed.files[0]!.revision,
      folderId: folder,
      name: 'renamed.png',
    });

    expect(moved.status).toBe(200);
    expect((await moved.json()).files[0]).toMatchObject({
      fileId: opened.fileId, folderId: folder, name: 'renamed.png',
    });
    expect(fullCatalogue).not.toHaveBeenCalled();
  });

  it('rejects a picker upload by detected MIME before storing it', async () => {
    const siteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'MimePicker', primaryDomain: 'mime-picker.test',
    })).siteId;
    const store = local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE);
    const base = '/api/admin/sites/' + siteId + '/files';
    const body = {
      mode: ImageUploadMode.Original,
      expectedVersion: '0',
      filename: 'picker.png',
      folderId: null,
      base64: (await png(4, 4)).toString('base64'),
    };
    const rejected = await command(base, { ...body, mimeTypes: ['image/jpeg'] });

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'FilePickerType' });
    expect(await store.status(siteId)).toEqual({ version: '0', pending: false });
    expect(await connection.collection('assets').countDocuments({ siteId })).toBe(0);
    expect(await connection.collection('media_files').countDocuments({ siteId })).toBe(0);
    expect((await command(base, body)).status).toBe(200);
  });

  it('isolates identical file and folder names between sites in metadata, storage and HTTP', async () => {
    let first = await operations.list.execute({ siteId });
    const originalIds = first.files.map((file) => file.fileId);

    first = await operations.createFolder.execute({
      siteId, expectedVersion: first.version, parentId: null, name: 'Isolation',
    });
    const firstFolderId = first.folders.find((folder) => folder.name === 'Isolation')!.folderId;

    first = await operations.upload.execute({
      siteId,
      expectedVersion: first.version,
      filename: 'isolated.png',
      folderId: firstFolderId,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(await png(), 'image/png'),
    });
    const firstFile = first.files.find((file) => file.name === 'isolated.png')!;
    let second = await operations.createFolder.execute({
      siteId: otherSiteId, expectedVersion: '0', parentId: null, name: 'Isolation',
    });

    second = await operations.upload.execute({
      siteId: otherSiteId,
      expectedVersion: second.version,
      filename: firstFile.name,
      folderId: second.folders[0]!.folderId,
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(12, 8, '#ff0000'), 'image/png'),
    });
    const secondFile = second.files[0]!;
    const listing = await fetch(origin + '/api/admin/sites/' + otherSiteId + '/files', { headers: { Cookie: cookie } });
    const listed: IMediaLibraryView = await listing.json();

    expect(listing.status).toBe(200);
    expect(listed.files.map((file) => file.fileId)).toEqual([secondFile.fileId]);
    expect(listed.folders.map((folder) => folder.folderId)).toEqual([second.folders[0]!.folderId]);
    expect((await operations.list.execute({ siteId })).files.map((file) => file.fileId))
      .toEqual([...originalIds, firstFile.fileId]);
    expect(first.files).toHaveLength(1);
    expect(listed.files.some((file) => file.fileId === firstFile.fileId)).toBe(false);
    const store = local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE);
    const firstStored = (await store.read(siteId)).library.files.find((file) => file.fileId === firstFile.fileId)!;
    const secondStored = (await store.read(otherSiteId)).library.files
      .find((file) => file.fileId === secondFile.fileId)!;

    expect(firstStored.image.original.contentId).toContain('private/' + siteId + '/');
    expect(secondStored.image.original.contentId).toContain('private/' + otherSiteId + '/');

    for (const [owner, file] of [[siteId, firstFile], [otherSiteId, secondFile]] as const) {
      for (const output of file.outputs) {
        expect(output.url).toContain('/assets/images/Isolation/');
        expect(await readFile(path.join(root, 'data', owner === siteId ? '127.0.0.1' : 'other.test',
          decodeURIComponent(output.url.slice('/assets/'.length)))))
          .toBeInstanceOf(Buffer);
      }
    }
    // The test server hostname belongs to the first site, so it cannot serve the second site's paths.
    expect((await fetch(origin + secondFile.outputs[0]!.url)).status).toBe(404);

    for (const [owner, foreign, version] of [[siteId, secondFile, first.version],
      [otherSiteId, firstFile, second.version]] as const) {
      const base = '/api/admin/sites/' + owner + '/files/' + foreign.fileId;

      expect((await fetch(origin + base + '/content?key=original', { headers: { Cookie: cookie } })).status).toBe(404);
      expect((await command(base + '/move', { expectedVersion: version, name: 'stolen.png', folderId: null })).status)
        .toBe(404);
      expect((await command(base + '/delete', { force: true })).status).toBe(404);
    }
    expect((await operations.list.execute({ siteId })).version).toBe(first.version);
    expect((await operations.list.execute({ siteId: otherSiteId })).version).toBe(second.version);
    const foreignFolder = await command('/api/admin/sites/' + otherSiteId + '/files/' + secondFile.fileId + '/move', {
      expectedVersion: second.version, name: secondFile.name, folderId: firstFolderId,
    });

    expect(foreignFolder.status).toBe(400);
    expect((await operations.list.execute({ siteId: otherSiteId })).version).toBe(second.version);
  });

  it('onboards by future domain while serving pages and files only at the selected origin', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        url: origin + '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.setDefaultTimeout(7000);
      await page.goto(origin + '/admin/sites/new');
      await page.getByLabel('Site name', { exact: true }).fill('Future site');
      await page.getByLabel('Domain', { exact: true }).fill('future-onboarding.test');
      await page.getByLabel('Site key', { exact: true }).fill('FutureOnboarding');
      await page.locator('#site-language').fill('en');
      await page.locator('#site-local-address').fill('http://localhost');
      await page.locator('#site-origin-local').check();
      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      await page.getByText('Enter an HTTP(S) address with an explicit port', { exact: false })
        .waitFor();
      await page.locator('#site-local-address').fill('localhost:3301');
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: '.tmp/site-onboarding-mobile.png' });
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.screenshot({ path: '.tmp/site-onboarding-desktop.png' });
      const creation = page.waitForResponse((response) => response.url().endsWith('/api/admin/sites')
        && response.request().method() === 'POST');

      await page.getByRole('button', { name: 'Create site', exact: true }).click();
      const response = await creation;

      expect(response.status()).toBe(201);
      const site: { siteId: string;
        primaryDomain: string;
        addresses: {
          publicOrigin: string; localOrigin: string; originMode: string;
        } } = await response.json();
      const base = '/api/admin/sites/' + site.siteId;

      expect(site.primaryDomain).toBe('future-onboarding.test');
      expect(site.addresses).toEqual({
        publicOrigin: 'https://future-onboarding.test', localOrigin: 'http://localhost:3301', originMode: 'Local',
      });

      for (const directory of ['images', 'files', '.private']) {
        expect(await readFile(path.join(root, 'data/future-onboarding.test/.site.json'), 'utf8'))
          .toContain(site.siteId);
        expect((await stat(path.join(root, 'data/future-onboarding.test', directory))).isDirectory()).toBe(true);
      }
      const created = await command(base + '/pages', {
        mark: 'FutureHome', title: 'Future home', language: 'en', contentMd: 'Future site content',
      });
      const home: { pageId: string } = await created.json();

      expect((await command(base + '/pages/' + home.pageId + '/publication', {
        templateId: 'ZaryaBasic', path: '/',
      })).status).toBe(200);
      expect((await publicGet('/', 'localhost:3301')).status).toBe(200);
      expect((await publicGet('/', 'localhost:3302')).status).toBe(404);
      expect((await publicGet('/', 'future-onboarding.test')).status).toBe(404);
      const sitemap = await publicGet('/sitemap.xml', 'localhost:3301');

      expect(sitemap.status).toBe(200);
      expect(sitemap.body.toString()).toContain('http://localhost:3301/');
      expect(sitemap.body.toString()).not.toContain('https://future-onboarding.test/');
      let library = await operations.list.execute({ siteId: site.siteId });

      library = await operations.upload.execute({
        siteId: site.siteId,
        expectedVersion: library.version,
        filename: 'future.csv',
        folderId: null,
        mode: ImageUploadMode.Original,
        content: assetBinary(Buffer.from('name,value\nTest,1\n'), 'text/csv'),
      });
      const asset = library.files[0]!.outputs[0]!.url;

      expect((await publicGet(asset, 'localhost:3301')).status).toBe(200);
      expect((await publicGet(asset, 'localhost:3302')).status).toBe(404);
      expect((await publicGet(asset, 'future-onboarding.test')).status).toBe(404);
      await page.goto(origin + '/admin/sites/' + site.siteId + '/settings');
      await page.getByRole('radio', { name: /^Use the domain/ }).check();
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await page.getByText('Site address settings saved.', { exact: true }).waitFor();
      expect((await publicGet('/', 'localhost:3301')).status).toBe(404);
      expect((await publicGet('/', 'future-onboarding.test')).status).toBe(200);
      expect((await publicGet(asset, 'future-onboarding.test')).status).toBe(200);
      expect((await command(base + '/urls/publish', {})).status).toBe(200);
      expect((await publicGet('/sitemap.xml', 'future-onboarding.test')).body.toString())
        .toContain('https://future-onboarding.test/');
      expect(await readFile(path.join(root, 'data/future-onboarding.test/files/future.csv'), 'utf8'))
        .toContain('name,value');
      await verifyMigrations(connection, 'migrations');
    } finally {
      await context.close();
      await browser.close();
    }
  }, 30000);

  it('rejects occupied development addresses in real composition and accepts a different port', async () => {
    const create = (mark: string, port: number, originMode: string): Promise<Response> => command('/api/admin/sites', {
      ...siteInput(),
      mark,
      primaryDomain: mark.toLowerCase() + '.test',
      onboarding: { localAddress: 'http://localhost:' + port + '/', originMode },
    });

    expect((await create('AddressOwner', 3310, 'Local')).status).toBe(201);

    for (const mode of ['Local', 'Public']) {
      const rejected = await create('AddressConflict' + mode, 3310, mode);

      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toEqual({ error: 'Conflict', field: 'onboarding.localAddress' });
    }
    expect((await create('AddressCorrected', 3311, 'Local')).status).toBe(201);
  });

  it('onboards with unique concurrent origins and supports a public origin immediately', async () => {
    const attempts = await Promise.all(['FirstOrigin', 'SecondOrigin'].map((mark) => command('/api/admin/sites', {
      ...siteInput(),
      mark,
      primaryDomain: mark.toLowerCase() + '.test',
      onboarding: {
        localAddress: 'localhost:3303', originMode: 'Local',
      },
    })));

    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
    const created = await command('/api/admin/sites', {
      ...siteInput(),
      mark: 'PublicOrigin',
      primaryDomain: 'public-onboarding.test',
      onboarding: { localAddress: 'localhost:3304', originMode: 'Public' },
    });

    expect(created.status).toBe(201);
    const site: { siteId: string } = await created.json();
    const base = '/api/admin/sites/' + site.siteId;
    const page: { pageId: string } = await (await command(base + '/pages', {
      mark: 'PublicHome', title: 'Public home', contentMd: 'Public content', language: 'en',
    })).json();

    expect((await command(base + '/pages/' + page.pageId + '/publication', {
      templateId: 'ZaryaBasic', path: '/',
    })).status).toBe(200);
    expect((await publicGet('/', 'public-onboarding.test')).status).toBe(200);
    // The public site's local address is stored but unselected.
    expect((await publicGet('/', 'localhost:3304')).status).toBe(404);
    expect((await publicGet('/', 'localhost:3303')).status).toBe(404);
    expect((await publicGet('/sitemap.xml', 'public-onboarding.test')).body.toString())
      .toContain('https://public-onboarding.test/');
    expect((await stat(path.join(root, 'data/public-onboarding.test/files'))).isDirectory()).toBe(true);
    await verifyMigrations(connection, 'migrations');
  });

  it('separates folder selection from disclosure and shadows both Files scroll panes', async () => {
    const treeSiteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'TreeAffordances', primaryDomain: 'tree-affordances.test',
    })).siteId;
    let library = await operations.createFolder.execute({
      siteId: treeSiteId, expectedVersion: '0', parentId: null, root: MediaRoot.Files, name: 'Outer',
    });
    const outerId = library.folders[0]!.folderId;

    library = await operations.createFolder.execute({
      siteId: treeSiteId, expectedVersion: library.version, parentId: outerId, root: MediaRoot.Files, name: 'Inner',
    });
    library = await operations.upload.execute({
      siteId: treeSiteId,
      expectedVersion: library.version,
      filename: 'root.csv',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(Buffer.from('name,value\nExample,1\n'), 'text/csv'),
    });
    await operations.upload.execute({
      siteId: treeSiteId,
      expectedVersion: library.version,
      filename: 'root.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(await png(32, 16), 'image/png'),
    });
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        url: origin + '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.setDefaultTimeout(6000);
      await page.goto(origin + '/admin/sites/' + treeSiteId + '/files');
      const rootSelect = page.locator('#files-drawer').getByRole('button', { name: 'assets/files', exact: true });

      await rootSelect.click();
      const contents = page.locator('#files-workspace .folder-contents');

      await contents.getByRole('heading', { name: 'Folder contents', exact: true }).waitFor();
      await contents.getByText('Direct children: folders — 1 · files — 1').waitFor();
      expect(await contents.getByRole('link', { name: 'root.csv', exact: true }).getAttribute('href'))
        .toContain('/files/');
      await contents.getByRole('button', { name: 'List', exact: true }).click();
      await contents.getByRole('columnheader', { name: 'Modified', exact: true }).waitFor();
      await contents.getByRole('button', { name: 'Grid', exact: true }).click();
      await page.screenshot({ path: '.tmp/folder-contents-desktop.png' });
      await contents.getByRole('link', { name: 'root.csv', exact: true }).click();
      await page.getByRole('heading', { name: 'Rename file: root.csv', exact: true }).waitFor();
      await rootSelect.click();
      await contents.getByRole('heading', { name: 'Folder contents', exact: true }).waitFor();
      const tree = page.locator('#files-drawer');
      const outer = tree.getByRole('button', { name: 'Outer', exact: true, includeHidden: true });
      const row = outer.locator('..');
      const toggle = page.locator('[data-folder-toggle="' + outerId + '"]');
      const root = rootSelect.locator('..');

      expect((await row.boundingBox())!.x - (await root.boundingBox())!.x).toBe(16);
      expect(await tree.getByRole('button', { name: 'root.csv', exact: true }).count()).toBe(0);
      expect(await tree.getByRole('button', { name: 'root.png', exact: true }).count()).toBe(0);
      expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(233, 238, 226)');
      await outer.hover();
      expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(229, 236, 220)');
      await outer.click();
      expect(await toggle.getAttribute('aria-expanded')).toBe('false');
      expect(await tree.getByRole('button', { name: 'Inner', exact: true }).count()).toBe(0);
      await contents.getByText('Direct children: folders — 1 · files — 0').waitFor();
      await contents.getByRole('button', { name: 'Inner', exact: true }).click();
      await contents.getByText('This folder is empty.', { exact: false }).waitFor();
      const trail = contents.getByRole('navigation', { name: 'Breadcrumbs', exact: true });
      const parent = trail.getByRole('link', { name: 'Outer', exact: true });
      const rootCrumb = trail.getByRole('link', { name: 'assets/files', exact: true });

      await parent.waitFor({ timeout: 2000 });
      expect(await rootCrumb.getAttribute('href')).toBe('/admin/sites/' + treeSiteId + '/files?root=files');
      expect(await trail.locator('[aria-current="page"]').innerText()).toBe('Inner');
      expect(await trail.getByRole('button').count()).toBe(0);
      await parent.press('Enter');
      await contents.getByRole('button', { name: 'Inner', exact: true }).waitFor();
      expect(await trail.locator('[aria-current="page"]').innerText()).toBe('Outer');
      await page.goBack();
      await contents.getByText('This folder is empty.', { exact: false }).waitFor();
      expect(await trail.locator('[aria-current="page"]').innerText()).toBe('Inner');
      const copiedPath = await parent.getAttribute('href');
      const copy = await context.newPage();

      try {
        await copy.goto(origin + copiedPath!);
        const copiedTrail = copy.locator('#files-workspace .folder-contents')
          .getByRole('navigation', { name: 'Breadcrumbs', exact: true });

        await copiedTrail.locator('[aria-current="page"]').waitFor();
        expect(await copiedTrail.locator('[aria-current="page"]').innerText()).toBe('Outer');
      } finally {
        await copy.close();
      }
      await outer.click();
      expect(await toggle.getAttribute('aria-expanded')).toBe('true');
      await toggle.click();
      expect(await row.evaluate((element) => getComputedStyle(element).borderColor)).toBe('rgb(49, 88, 62)');
      await toggle.press('Space');
      await tree.getByRole('button', { name: 'Inner', exact: true }).waitFor();
      const innerRow = tree.getByRole('button', { name: 'Inner', exact: true }).locator('..');

      expect((await innerRow.boundingBox())!.x - (await row.boundingBox())!.x).toBe(16);
      expect(await outer.getAttribute('aria-current')).toBe('page');
      expect(await toggle.evaluate((element) => getComputedStyle(element).borderRightWidth)).toBe('1px');
      expect((await toggle.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      const rootToggle = page.getByRole('button', { name: 'Expand or collapse folder assets/files', exact: true });

      await rootToggle.click();
      expect(await outer.count()).toBe(0);
      await rootSelect.click();
      expect(await rootToggle.getAttribute('aria-expanded')).toBe('false');
      expect(await rootSelect.getAttribute('aria-current')).toBe('page');
      await rootToggle.click();
      await outer.waitFor();
      await page.setViewportSize({ width: 1440, height: 400 });
      await verifyScrollShadow(page.locator('#files-drawer ._tree-scroll'),
        page.locator('#files-drawer ._drawer-heading'));
      await verifyScrollShadow(page.locator('#files-workspace ._workspace-scroll'),
        page.locator('#files-workspace ._workspace-toolbar'));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#files-workspace').getByRole('button', { name: 'File tree', exact: true }).click();
      await outer.tap();
      expect(await outer.getAttribute('aria-current')).toBe('page');
      expect(await contents.isVisible()).toBe(true);
      await expect.poll(async () => (await page.locator('#files-workspace').boundingBox())!.x).toBeCloseTo(0, 0);
      await page.screenshot({ path: '.tmp/folder-contents-mobile.png' });
      await page.locator('#files-workspace').getByRole('button', { name: 'File tree', exact: true }).click();
      await toggle.tap();
      expect(await toggle.getAttribute('aria-expanded')).toBe('false');
      expect(await outer.getAttribute('aria-current')).toBe('page');
      await page.screenshot({ path: '.tmp/folder-affordances-mobile.png' });
    } finally {
      await context.close();
      await browser.close();
    }
  });
  it('uploads copied CSV/XLSX filenames and shows precise upload errors in the built Files UI', async () => {
    const docsSiteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'UploadDiagnostics', primaryDomain: 'diagnostics.test',
    })).siteId;
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        url: origin + '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.setDefaultTimeout(8000);
      await page.goto(origin + '/admin/sites/' + docsSiteId + '/files');
      await page.getByRole('button', { name: 'assets/files', exact: true }).click();
      const main = page.locator('#files-workspace');
      const input = main.locator('.file-upload input[type=file]');
      const csv = Buffer.from('name,value\nTest,1\n');
      const workbook = xlsxFixture();
      const accepted = [
        { name: 'chgowrn_food (2).csv', mimeType: 'text/csv', buffer: csv },
        {
          name: 'report (2).xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: workbook,
        },
      ];

      await input.setInputFiles(accepted);
      await main.getByRole('button', { name: 'Upload files', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.file-upload ._file-upload-row'));
      const library = await operations.list.execute({ siteId: docsSiteId });

      expect(library.files).toHaveLength(2);
      const contents = main.locator('.folder-contents');

      await contents.getByText('Direct children: folders — 0 · files — 2').waitFor();
      expect(await contents.getByRole('link').count()).toBe(2);

      for (const file of accepted) {
        const stored = library.files.find((item) => item.name === file.name)!;

        expect(stored.hasVariants).toBe(false);
        expect(stored.mimeType).toBe(file.mimeType);
        const response = await publicGet(stored.outputs[0]!.url, 'diagnostics.test');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(file.buffer);
      }
      await page.locator('.admin-language select').selectOption('ru');

      for (const [name, buffer, message] of [
        ['bad?.csv', csv, 'Недопустимое имя.'],
        ['CON.csv', csv, 'зарезервировано Windows'],
        ['unsupported.exe', csv, 'Расширение не поддерживается.'],
        ['fake.xlsx', csv, 'Содержимое файла не соответствует расширению'],
        ['encoding.csv', Buffer.from([0xff, 0xfe, 0x41, 0x00]), 'CSV должен быть в кодировке UTF-8.'],
        ['binary.csv', Buffer.from('a,\0b'), 'CSV содержит двоичные/управляющие символы'],
        ['empty.csv', Buffer.alloc(0), 'Файл пустой (0 байт).'],
      ] as const) {
        await input.setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
        await main.getByRole('button', { name: 'Загрузить файлы', exact: true }).click();
        const alert = main.getByRole('alert');

        await alert.getByText(message, { exact: false }).waitFor();
        expect(await alert.innerText()).toContain(name + ':');
        await main.locator('._file-upload-row').getByRole('button', { name: 'Отмена', exact: true }).click();
      }
      await input.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error('Expected upload input');
        }

        const transfer = new DataTransfer();

        transfer.items.add(new File([new Uint8Array(64 * 1024 * 1024 + 1)], 'large.csv'));
        element.files = transfer.files;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await main.getByRole('button', { name: 'Загрузить файлы', exact: true }).click();
      await main.getByRole('alert').getByText('large.csv: Размер документа превышает допустимые 64 МиБ.',
        { exact: true }).waitFor();
      await page.screenshot({ path: '.tmp/file-upload-diagnostics.png' });
      expect((await operations.list.execute({ siteId: docsSiteId })).files).toHaveLength(2);
    } finally {
      await context.close();
      await browser.close();
    }
  }, 30000);
  it('serves documents and relocates images, documents and originals when the primary domain changes', async () => {
    const docsSiteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'Documents', primaryDomain: 'documents.test',
    })).siteId;
    let library = await operations.createFolder.execute({
      siteId: docsSiteId, expectedVersion: '0', root: MediaRoot.Files, parentId: null, name: 'Reports',
    });
    const folderId = library.folders[0]!.folderId;

    for (const [filename, value] of [['data.json', '{"ok":true}'], ['table.csv', 'name,value\nA,1\n'],
      ['report.pdf', '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n']]) {
      const uploaded = await command('/api/admin/sites/' + docsSiteId + '/files', {
        expectedVersion: library.version,
        filename,
        folderId,
        mode: ImageUploadMode.Original,
        base64: Buffer.from(value!).toString('base64'),
      });

      expect(uploaded.status).toBe(200);
      library = await uploaded.json();
      const file = library.files.find((item) => item.name === filename)!;

      expect(file.originalDimensions).toBeNull();
      expect(file.hasVariants).toBe(false);
      expect(file.outputs[0]!.url).toBe('/assets/files/Reports/' + filename);
      expect(file.outputs[0]!.dimensions).toBeNull();
      const response = await publicGet(file.outputs[0]!.url, 'documents.test');

      expect(response.status).toBe(200);
      expect(response.body.toString()).toBe(value);
    }
    const denied = await command('/api/admin/sites/' + docsSiteId + '/files', {
      expectedVersion: library.version,
      filename: 'bad.json',
      folderId,
      mode: ImageUploadMode.Original,
      base64: Buffer.from('{bad}').toString('base64'),
    });

    expect(denied.status).toBe(400);
    await expect(operations.upload.execute({
      siteId: docsSiteId,
      expectedVersion: library.version,
      filename: 'wrong.png',
      folderId,
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(20, 10), 'image/png'),
    })).rejects.toMatchObject({ code: 'Validation' });
    await operations.upload.execute({
      siteId: docsSiteId,
      expectedVersion: library.version,
      filename: 'picture.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(await png(20, 10), 'image/png'),
    });
    const urls = (await operations.list.execute({ siteId: docsSiteId })).files
      .flatMap((file) => file.outputs.map((output) => output.url));

    await local.get<IUpdateSite>(UPDATE_SITE).execute({ siteId: docsSiteId, primaryDomain: 'renamed.test' });
    expect((await operations.list.execute({ siteId: docsSiteId })).files.flatMap((file) =>
      file.outputs.map((output) => output.url))).toEqual(urls);
    expect(await readFile(path.join(root, 'data/renamed.test/files/Reports/data.json'), 'utf8')).toBe('{"ok":true}');
    await expect(readFile(path.join(root, 'data/documents.test/files/Reports/data.json')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    const stored = (await local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE).read(docsSiteId)).library;

    for (const file of stored.files) {
      expect(await readFile(path.join(root, 'data/renamed.test/.private/objects',
        ...file.image.original.contentId.split('/').slice(2)))).toBeInstanceOf(Buffer);
    }

    for (const url of urls) {
      expect((await publicGet(url, 'renamed.test')).status, url).toBe(200);
      expect((await publicGet(url, 'documents.test')).status, url).toBe(404);
    }
    expect((await fetch(origin + '/assets/styles/unknown.css')).status).toBe(404);
    await verifyMigrations(connection, 'migrations');
  });

  it('guards concurrent moves, reports grouped uses, and Force deletes without checking references', async () => {
    let library = await operations.list.execute({ siteId });

    library = await operations.upload.execute({
      siteId,
      expectedVersion: library.version,
      filename: 'force-delete.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(), 'image/png'),
    });
    const file = library.files.find((item) => item.name === 'force-delete.png')!;
    const oldUrls = file.outputs.map((item) => item.url);
    const moved = await Promise.allSettled(['first.png', 'second.png'].map((name) => operations.move.execute({
      siteId,
      expectedVersion: library.version,
      fileId: file.fileId,
      folderId: null,
      name,
    })));

    expect(moved.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    library = await operations.list.execute({ siteId });

    for (const url of oldUrls) {
      expect((await fetch(origin + url)).status).toBe(404);
    }
    const current = library.files.find((item) => item.fileId === file.fileId)!;
    const imageUrl = current.outputs.at(-1)!.url;

    await local.get<ICreatePage>(CREATE_PAGE).execute({
      siteId,
      mark: 'UsesImage',
      language: 'en',
      title: 'Image uses',
      contentMd: '<img src="' + imageUrl + '" width="600" height="300">',
      ogImage: origin + imageUrl,
    });
    const usages = await operations.usages.execute({
      siteId, fileId: current.fileId, expectedVersion: library.version,
    });

    expect(usages.usages.map((usage) => usage.group)).toEqual(expect.arrayContaining(['Content', 'OpenGraph']));
    await expect(operations.delete.execute({
      siteId, expectedVersion: library.version, fileId: current.fileId, force: false,
    }))
      .rejects.toMatchObject({ code: 'Conflict' });
    const state = (await local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE).read(siteId))
      .library.files.find((item) => item.fileId === file.fileId)!;
    const originalPath = path.join(root, 'data/127.0.0.1/.private/objects',
      ...state.image.original.contentId.split('/').slice(2));

    expect(await readFile(originalPath)).toBeInstanceOf(Buffer);
    const result = await operations.delete.execute({
      siteId, fileId: current.fileId, expectedVersion: 'intentionally-old', force: true,
    });

    expect(result.files).toEqual([]);
    expect((await operations.list.execute({ siteId })).files).toEqual(
      library.files.filter((item) => item.fileId !== file.fileId),
    );
    expect((await fetch(origin + imageUrl)).status).toBe(404);
    await expect(readFile(originalPath))
      .rejects.toMatchObject({ code: 'ENOENT' });
    const removedAsset = await connection.collection<{ _id: string }>('assets')
      .findOne({ _id: state.image.assetVersion });

    expect(removedAsset).toBeNull();
  });

  it('uploads and replaces the same filename through the edge gateway and real authenticated HTTP', async () => {
    const originalFetch = globalThis.fetch;
    const site = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'EdgeUploads', primaryDomain: 'edge-upload.test',
    })).siteId;
    const worker = createCloudflareWorker({
      publicOrigin: origin, backendOrigin: origin, mediaPath: '/assets', requestPaths: [], staticPolicies: {},
    });
    let library = await operations.list.execute({ siteId: site });
    let fileId = '';

    vi.stubGlobal('fetch', (request: Request) => originalFetch(request));

    try {
      for (const filename of ['logo.png', 'logo.png', 'local-copy.png']) {
        const bytes = await png(32, 24, filename === 'local-copy.png' ? '#0055ff' : '#ff0000');
        const metadata = fileId ? { expectedVersion: library.version, filename }
          : { expectedVersion: library.version, filename, folderId: null, mode: 'Responsive' };
        const response = await worker.fetch(new Request(origin + '/api/admin/sites/' + site + '/files'
          + (fileId ? '/' + fileId + '/change' : ''), {
          method: 'POST',
          body: new Uint8Array(bytes),
          headers: {
            Origin: origin,
            'X-Zarya-Admin': '1',
            Cookie: cookie,
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(bytes.length),
            'X-Zarya-File-Metadata': encodeURIComponent(JSON.stringify(metadata)),
          },
        }), { ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'synthetic-edge-secret' });

        expect(response.status).toBe(200);
        library = await response.json();
        expect(library.files).toHaveLength(1);
        expect(library.files[0]!.name).toBe('logo.png');
        fileId = library.files[0]!.fileId;
        expect(library.files[0]!.outputs.every((output) => output.url.includes('/logo--'))).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('updates published media and cancels cached refreshes without publishing other draft changes', async () => {
    const site = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'PublishedMedia', primaryDomain: 'published-media.test',
    })).siteId;
    const base = '/api/admin/sites/' + site;
    const library = await operations.upload.execute({
      siteId: site,
      expectedVersion: '0',
      filename: 'original.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(await png(1024, 512), 'image/png'),
    });
    const file = library.files[0]!;
    const image = file.outputs.at(-1)!.url;
    const source = {
      name: 'Published media',
      parameters: [],
      html: '<html><head></head><body><h1>[[*title]]</h1><p>[[+built]]</p>'
        + '<img width="1024" height="512" alt="Synthetic" src="' + image + '" srcset="' + file.outputs.map((output) =>
        output.url + ' ' + output.dimensions!.width + 'w').join(', ') + '"></body></html>',
      css: 'body{background-image:url(' + image + ')}',
      browserTypeScript: '',
    };
    const response = await command(base + '/templates', source);

    expect(response.status).toBe(201);
    const template: { key: string; version: string } = await response.json();
    const pages: string[] = [];

    for (const delivery of [HtmlDelivery.Static, HtmlDelivery.Request]) {
      const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
        siteId: site, mark: delivery, title: 'Published ' + delivery, language: 'en',
      });

      pages.push(page.pageId);
      await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
        siteId: site,
        pageId: page.pageId,
        actorId: 'operator',
        rendering: {
          templateId: template.key,
          delivery,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [{
            loaderId: 'FrozenMediaLabel',
            alias: 'built',
            phase: LoaderPhase.Build,
            required: true,
            parameters: {},
            dependsOn: [],
          }],
          ...(delivery === HtmlDelivery.Request
            ? { requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 } } : {}),
        },
      });
      await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
        siteId: site,
        pageId: page.pageId,
        mark: delivery + 'Url',
        parentUrlId: null,
        path: '/' + delivery.toLowerCase() + '/',
        segment: delivery.toLowerCase(),
      });
      await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site, pageId: page.pageId });
    }
    const firstIcon = await icoFixture(32);
    const iconUpload = await command(base + '/favicon', {
      filename: 'favicon.ico', base64: firstIcon.toString('base64'),
    });

    expect(iconUpload.status, 'initial favicon upload: ' + await iconUpload.clone().text()).toBe(200);
    const iconData: { favicon: { version: string } } = await iconUpload.json();
    const previous = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site);
    const published = await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site,
      actorId: 'operator',
      expectedActiveReleaseId: previous?.releaseId ?? null,
    });
    const builds = buildReads;

    for (const pageId of pages) {
      await local.get<IUpdatePage>(UPDATE_PAGE).execute({
        siteId: site, pageId, title: 'Unpublished title', contentMd: 'Unpublished body',
      });
    }
    const draft = await command(base + '/templates/' + template.key, {
      ...source,
      expectedVersion: template.version,
      html: source.html.replace('<h1>', '<p>Unpublished template</p><h1>'),
    });

    expect(draft.status).toBe(200);
    const cached = await publicGet('/request/', 'published-media.test');

    expect(cached.status, 'initial cached page: ' + cached.body.toString()).toBe(200);
    expect(cached.body.toString()).toContain(image);
    expect(cached.body.toString()).toContain('/favicon.ico?v=' + iconData.favicon.version);
    const cache = app.get<RequestDocumentCacheService>(REQUEST_DOCUMENT_CACHE);

    expect(cache.refreshSnapshot().scheduled).toBe(1);
    const rename = await command(base + '/files/' + file.fileId + '/move', {
      expectedVersion: library.version, folderId: null, name: 'renamed.png', updateReferences: true,
    });

    expect(rename.status, await rename.clone().text()).toBe(200);
    const updated: IMediaLibraryView = await rename.json();

    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, bytes: 0, active: 0 });
    const active = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site);

    expect(active!.releaseId).not.toBe(published.releaseId);
    expect(buildReads).toBe(builds);

    for (const delivery of [HtmlDelivery.Static, HtmlDelivery.Request]) {
      const publicPage = await publicGet('/' + delivery.toLowerCase() + '/', 'published-media.test');

      expect(publicPage.status, 'renamed page: ' + publicPage.body.toString()).toBe(200);
      const html = publicPage.body.toString();

      expect(html).toContain('Published ' + delivery);
      expect(html).toContain('Frozen Build value');
      expect(html).not.toContain('Unpublished');
      expect(html).not.toContain('original--');

      for (const output of updated.files[0]!.outputs) {
        expect(html).toContain(output.url);
        expect((await publicGet(output.url, 'published-media.test')).status).toBe(200);
      }
    }

    for (const pageId of pages) {
      expect((await local.get<IGetPage>(GET_PAGE).execute({ siteId: site, pageId }))!.toState())
        .toMatchObject({ title: 'Unpublished title', contentMd: 'Unpublished body' });
    }
    expect(buildReads).toBe(builds);
    const secondIcon = await icoFixture(64);
    const replacedIcon = await command(base + '/favicon', {
      filename: 'favicon.ico', base64: secondIcon.toString('base64'),
    });

    expect(replacedIcon.status, await replacedIcon.clone().text()).toBe(200);
    const nextIcon: { favicon: { version: string } } = await replacedIcon.json();

    expect(nextIcon.favicon.version).not.toBe(iconData.favicon.version);
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, bytes: 0 });

    for (const path of ['/static/', '/request/']) {
      const result = await publicGet(path, 'published-media.test');

      expect(result.status, 'favicon page: ' + result.body.toString()).toBe(200);
      expect(result.body.toString()).toContain('/favicon.ico?v=' + nextIcon.favicon.version);
      expect(result.body.toString()).not.toContain('Unpublished');
      expect(result.body.toString().match(/data-zarya-favicon/gu)).toHaveLength(1);
    }
    const removedPath = base + '/favicon/delete';

    expect((await command(removedPath, {}, '')).status).toBe(401);
    expect((await command(removedPath, { siteId: otherSiteId })).status).toBe(400);
    const removed = await command(removedPath, {});

    expect(removed.status, await removed.clone().text()).toBe(200);
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, bytes: 0 });
    expect((await publicGet('/favicon.ico', 'published-media.test')).status).toBe(404);

    for (const path of ['/static/', '/request/']) {
      const result = await publicGet(path, 'published-media.test');

      expect(result.status, 'favicon page: ' + result.body.toString()).toBe(200);
      expect(result.body.toString()).not.toContain('favicon');
      expect(result.body.toString()).not.toContain('Unpublished');
    }
    expect((await command(removedPath, {})).status).toBe(200);
    expect(buildReads).toBe(builds);
  });

  it('moves variants and updates guarded template, chunk and TV sources through real HTTP composition', async () => {
    const site = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'ReferenceEdits', primaryDomain: 'reference-edits.test',
    })).siteId;
    const base = '/api/admin/sites/' + site;
    let library = await operations.upload.execute({
      siteId: site,
      expectedVersion: '0',
      filename: 'photo.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(await png(1024, 512), 'image/png'),
    });
    const file = library.files[0]!;
    const old = file.outputs[0]!.url;
    const foreign = 'https://foreign.test/picture?next=' + old;
    const longer = old + ').webp';
    const source = {
      html: '<img src="' + old + '"><img src="' + foreign + '"><img src="' + longer + '">'
        + '<img srcset="' + foreign + ' 1x, ' + old + ' 2x">',
      css: 'a{background:url(' + old + ')}',
      browserTypeScript: 'const source = "' + old + '";',
      parameters: [],
    };
    const templateResponse = await command(base + '/templates', {
      ...source,
      name: 'Reference template',
      html: '<html><head></head><body>' + source.html + '</body></html>',
    });
    const chunkResponse = await command(base + '/chunks', { ...source, name: 'Reference chunk' });

    expect(templateResponse.status).toBe(201);
    expect(chunkResponse.status).toBe(201);
    const template: { key: string } = await templateResponse.json();
    const chunk: { key: string } = await chunkResponse.json();
    const tv = local.get<ITemplateVariableOperations>(TV_OPERATIONS);
    const fields = [{
      name: 'address',
      caption: 'Address',
      description: '',
      kind: TemplateVariableKind.Text,
      templateIds: [template.key],
      required: false,
      sortOrder: 0,
      defaultValue: old,
    }, {
      name: 'photo',
      caption: 'Photo',
      description: '',
      kind: TemplateVariableKind.Image,
      templateIds: [template.key],
      required: false,
      sortOrder: 1,
    }];

    await tv.save.execute({ siteId: site, expectedVersion: '0', fields });
    const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: site, mark: 'Home', title: 'Home', language: 'en',
    });
    const before = await tv.getPage.execute({ siteId: site, pageId: page.pageId });

    await tv.savePage.execute({
      siteId: site,
      pageId: page.pageId,
      templateId: template.key,
      values: { address: old, photo: { kind: 'Image', fileId: file.fileId, mode: 'Responsive', alt: 'Photo' } },
      expectedUpdatedAt: before.updatedAt,
      catalogVersion: before.catalog.version,
      mediaVersion: before.mediaVersion,
    });
    await local.get<IUpdatePage>(UPDATE_PAGE).execute({
      siteId: site,
      pageId: page.pageId,
      contentMd: '![Photo](' + old + ')',
      ogImage: 'https://reference-edits.test' + old,
    });
    const usages = await operations.usages.execute({
      siteId: site, fileId: file.fileId, expectedVersion: library.version,
    });

    expect(usages.usages.some((usage) => usage.target.kind === 'TemplateVariable')).toBe(true);
    expect(usages.usages.some((usage) => usage.field === 'tvValues')).toBe(true);
    const target = base + '/files/' + file.fileId + '/move';
    const move = {
      expectedVersion: library.version, folderId: null, name: 'renamed (2).png', updateReferences: true,
    };
    const anonymous = await fetch(origin + target, {
      method: 'POST',
      body: JSON.stringify(move),
      headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
    });
    const crossOrigin = await fetch(origin + target, {
      method: 'POST',
      body: JSON.stringify(move),
      headers: { Origin: 'https://foreign.test', 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: cookie },
    });

    expect(anonymous.status).toBe(401);
    expect(crossOrigin.status).toBe(403);
    expect((await command(target, { ...move, updateReferences: 'true' })).status).toBe(400);
    const otherLibrary = await operations.list.execute({ siteId: otherSiteId });

    expect((await command('/api/admin/sites/' + otherSiteId + '/files/' + file.fileId + '/move', {
      ...move, expectedVersion: otherLibrary.version,
    })).status).toBe(404);
    expect((await operations.list.execute({ siteId: site })).version).toBe(library.version);
    expect((await operations.list.execute({ siteId: otherSiteId })).version).toBe(otherLibrary.version);
    const failingContent = vi.spyOn(MediaReferenceUpdatesAdapter.prototype, 'replace')
      .mockRejectedValueOnce(new Error('Content temporarily unavailable'));
    let response: Response;

    try {
      response = await command(target, move);
    } finally {
      failingContent.mockRestore();
    }

    expect(response.status).toBe(200);
    const pending: IMediaLibraryView = await response.json();

    expect(pending.referenceUpdate).toBe('Pending');
    expect(pending.files[0]?.referencesPending).toBe(true);
    expect((await publicGet(old, 'reference-edits.test')).status).toBe(404);
    expect((await local.get<IGetPage>(GET_PAGE).execute({ siteId: site, pageId: page.pageId }))!
      .toState().contentMd).toContain(old);
    const blocker = (await operations.upload.execute({
      siteId: site,
      expectedVersion: pending.version,
      filename: 'photo.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: assetBinary(await png(64, 32), 'image/png'),
    })).files[0]!;

    expect(await (await command(target, { retryReferences: true })).json()).toMatchObject({
      referenceUpdate: 'AddressInUse',
    });
    expect((await local.get<IGetPage>(GET_PAGE).execute({ siteId: site, pageId: page.pageId }))!
      .toState().contentMd).toContain(old);
    await operations.delete.execute({ siteId: site, fileId: blocker.fileId, force: true });
    const failingPublication = vi.spyOn(PublishMediaAddressReleaseUseCase.prototype, 'execute')
      .mockRejectedValueOnce(new Error('Publication temporarily unavailable'));

    try {
      expect(await (await command(target, { retryReferences: true })).json()).toMatchObject({
        referenceUpdate: 'Pending',
      });
    } finally {
      failingPublication.mockRestore();
    }
    expect((await local.get<IGetPage>(GET_PAGE).execute({ siteId: site, pageId: page.pageId }))!
      .toState().contentMd).not.toContain(old);
    await app.close();
    app = await createPublicHttpApplication(httpSettings);
    const retried = await command(target, { retryReferences: true });

    expect(retried.status).toBe(200);
    library = await retried.json();
    expect(library.referenceUpdate).toBeUndefined();
    expect(library.files[0]?.referencesPending).toBeUndefined();
    expect(library.files[0]?.revision).toBe(pending.files[0]?.revision);
    expect(await (await command(target, { retryReferences: true })).json()).toEqual(library);
    const next = library.files[0]!.outputs[0]!.url.replace(/[()]/gu,
      (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase());

    for (const [section, key] of [['templates', template.key], ['chunks', chunk.key]]) {
      const saved = await fetch(origin + base + '/' + section + '/' + key, { headers: { Cookie: cookie } });
      const element: { html: string; css: string; browserTypeScript: string; backupState: string } = await saved.json();

      expect(saved.status).toBe(200);
      expect(element.backupState).toBe('Ready');
      expect(element.html).toContain(next);
      expect(element.css).toContain(next);
      expect(element.browserTypeScript).toContain(next);
      expect(element.html).not.toContain('src="' + old + '"');
      expect(element.html).toContain(foreign);
      expect(element.html).toContain(longer);
      expect(element.html).toContain('srcset="' + foreign + ' 1x, ' + next + ' 2x"');
    }
    expect((await tv.list.execute({ siteId: site })).fields[0]!.defaultValue).toBe(next);
    const after = await tv.getPage.execute({ siteId: site, pageId: page.pageId });

    expect(after.values.address).toBe(next);
    expect(after.values.photo).toMatchObject({ fileId: file.fileId });
    const savedPage = (await local.get<IGetPage>(GET_PAGE).execute({ siteId: site, pageId: page.pageId }))!.toState();

    expect(savedPage.contentMd).toBe('![Photo](' + next + ')');
    expect(savedPage.ogImage).toBe('https://reference-edits.test' + next);

    for (const previous of file.outputs) {
      const output = library.files[0]!.outputs.find((item) => item.key === previous.key)!;

      expect(output.url).toContain('/renamed%20(2)--' + previous.key + '.webp');
      expect((await publicGet(previous.url, 'reference-edits.test')).status).toBe(404);
      expect((await publicGet(output.url, 'reference-edits.test')).status).toBe(200);
      expect(output.dimensions).toEqual(previous.dimensions);
    }
    expect((await publicGet(old, 'reference-edits.test')).status).toBe(404);
    expect((await publicGet(next, 'reference-edits.test')).status).toBe(200);
    await local.get<IUpdatePage>(UPDATE_PAGE).execute({
      siteId: site, pageId: page.pageId, ogImage: 'https://reference-edits.test' + old,
    });
    const again = await command(target, {
      expectedVersion: library.version, folderId: null, name: 'final.png', updateReferences: true,
    });

    expect(again.status).toBe(200);
    const finalLibrary: IMediaLibraryView = await again.json();
    const finalUrl = finalLibrary.files[0]!.outputs[0]!.url;
    const repaired = (await local.get<IGetPage>(GET_PAGE).execute({ siteId: site, pageId: page.pageId }))!.toState();

    expect(repaired.ogImage).toBe('https://reference-edits.test' + finalUrl);
    expect(repaired.contentMd).toBe('![Photo](' + finalUrl + ')');
    expect((await publicGet(finalUrl, 'reference-edits.test')).status).toBe(200);
    expect((await publicGet(next, 'reference-edits.test')).status).toBe(404);
  });

  it('runs session-bound upload and image publication through HTTP and rejects unauthenticated changes', async () => {
    const base = '/api/admin/sites/' + siteId + '/files';
    const library = await operations.list.execute({ siteId });
    const body = {
      expectedVersion: library.version,
      filename: 'small.png',
      folderId: null,
      mode: 'Original',
      base64: (await png(24, 16)).toString('base64'),
    };

    expect((await command(base, body, '')).status).toBe(401);
    const uploaded = await command(base, body);

    expect(uploaded.status).toBe(200);
    const added: IMediaLibraryView = await uploaded.json();
    const file = added.files.find((item) => item.name === 'small.png')!;

    expect(file.hasVariants).toBe(false);
    expect(file.outputs).toHaveLength(1);
    expect(file.originalDimensions).toMatchObject({ width: 24, height: 16 });
    const imageUrl = file.outputs[0]!.url;
    const templateResponse = await command('/api/admin/sites/' + siteId + '/templates', {
      name: 'Image with browser script',
      html: '<!doctype html><html><head><title>[[*title]]</title></head>'
        + '<body>[[*contentMd:markdown]]</body></html>',
      css: '',
      browserTypeScript: 'document.body.dataset.image = ' + JSON.stringify(imageUrl) + ';',
      parameters: [],
    });

    expect(templateResponse.status).toBe(201);
    const template: { key: string } = await templateResponse.json();
    const created = await command('/api/admin/sites/' + siteId + '/pages', {
      mark: 'PublishedImage',
      language: 'en',
      title: 'Published image',
      contentMd: '<picture><img src="' + imageUrl + '" width="24" height="16" alt="Small"></picture>',
      ogImage: origin + imageUrl,
    });
    const page: { pageId: string } = await created.json();
    const published = await command('/api/admin/sites/' + siteId + '/pages/' + page.pageId + '/publication', {
      templateId: template.key, path: '/',
    });

    expect(published.status).toBe(200);
    const html = await (await fetch(origin + '/')).text();

    expect(html).toContain('<picture>');
    expect(html).toContain('width="24" height="16"');
    expect(html).toContain(imageUrl);
    const review = await operations.usages.execute({ siteId, fileId: file.fileId, expectedVersion: added.version });

    expect(review.usages.some((usage) => usage.state.startsWith('Release '))).toBe(true);
    expect(review.usages.some((usage) => usage.group === 'OpenGraph')).toBe(true);
    expect(review.usages).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'Templates', field: expect.stringMatching(/^diagnostics\/.*\.map$/) }),
      expect.objectContaining({ group: 'Templates', field: expect.stringMatching(/^assets\/scripts\/.*\.js$/) }),
    ]));
    const response = await fetch(origin + base + '/' + file.fileId + '/usages?expectedVersion=' + added.version, {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    const dto: {
      version: string;
      usages: { editorPath: string; group: string; title: string; field: string; state: string }[];
    } = await response.json();

    expect(dto.version).toBe(review.version);
    expect(dto.usages.map((usage) => ({
      group: usage.group, title: usage.title, field: usage.field, state: usage.state,
    })))
      .toEqual(review.usages.map((usage) => ({
        group: usage.group, title: usage.title, field: usage.field, state: usage.state,
      })));
    expect(dto.usages.every((usage) => usage.editorPath.startsWith('/admin/sites/' + siteId + '/'))).toBe(true);
    expect(dto.usages.find((usage) => usage.field === 'contentMd')?.editorPath)
      .toBe('/admin/sites/' + siteId + '/pages/' + page.pageId);
  });

  it('shows the built Files UI, both upload modes, copied HTML and Force delete without a dialog', async () => {
    const siteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'FilesUi', primaryDomain: 'files-ui.test',
    })).siteId;
    let library = await operations.list.execute({ siteId });

    library = await operations.createFolder.execute({
      siteId, expectedVersion: library.version, parentId: null, name: 'Photos',
    });
    library = await operations.upload.execute({
      siteId,
      expectedVersion: library.version,
      folderId: null,
      filename: 'small.png',
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(24, 16), 'image/png'),
    });
    const ownedFile = library.files.find((item) => item.name === 'small.png')!;
    const created = await command('/api/admin/sites/' + siteId + '/pages', {
      mark: 'FilesUiPage',
      language: 'en',
      title: 'Files UI page',
      contentMd: '<img src="' + ownedFile.outputs[0]!.url + '" width="24" height="16" alt="Small">',
    });

    expect(created.status).toBe(201);
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const token = cookie.slice(cookie.indexOf('=') + 1);

    await context.addCookies([{
      name: 'zarya_admin_session', value: token, url: origin + '/api/admin', httpOnly: true, sameSite: 'Strict',
    }]);
    const page = await context.newPage();
    const errors: string[] = [];
    let dialogs = 0;

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', async (dialog) => {
      dialogs++;
      await dialog.dismiss();
    });
    page.setDefaultTimeout(8000);

    try {
      await page.goto(origin + '/admin/sites/' + siteId + '/files');
      await page.getByRole('heading', { name: 'assets/images', exact: true, level: 1 }).waitFor();
      const view = page.getByRole('group', { name: 'File view', exact: true });
      const tiles = view.getByRole('button', { name: 'Grid', exact: true });
      const list = view.getByRole('button', { name: 'List', exact: true });

      await tiles.locator('svg').waitFor();
      await list.locator('svg').waitFor();
      expect(await tiles.getAttribute('aria-pressed')).toBe('true');
      expect(await list.getAttribute('aria-pressed')).toBe('false');
      const activeFill = await tiles.evaluate((button) => getComputedStyle(button).backgroundColor);

      expect(await list.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(activeFill);
      await list.click();
      expect(await tiles.getAttribute('aria-pressed')).toBe('false');
      expect(await list.getAttribute('aria-pressed')).toBe('true');
      await expect.poll(() => list.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(activeFill);
      await tiles.click();
      await page.getByRole('link', { name: 'small.png', exact: true }).click();
      await page.getByRole('heading', { name: 'Rename file: small.png', exact: true }).waitFor();
      const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumbs', exact: true });
      const filesLink = breadcrumbs.getByRole('link', { name: 'Files', exact: true });
      const filesPath = '/admin/sites/' + siteId + '/files';

      await filesLink.waitFor({ timeout: 2000 });
      expect(await filesLink.getAttribute('href')).toBe(filesPath);
      expect(await breadcrumbs.locator('[aria-current="page"]').innerText()).toBe('small.png');
      await filesLink.press('Enter');
      await page.waitForURL(origin + filesPath);
      await page.getByRole('link', { name: 'small.png', exact: true }).click();
      await page.getByRole('heading', { name: 'Rename file: small.png', exact: true }).waitFor();
      const nameInput = page.getByLabel('File name', { exact: true });
      const folderInput = page.getByRole('combobox', { name: 'Folder', exact: true });
      const saveName = page.getByRole('button', { name: 'Save name', exact: true });
      const saveFolder = page.getByRole('button', { name: 'Save folder', exact: true });
      const folders = (await operations.list.execute({ siteId })).folders;
      const photos = folders.find((item) => item.name === 'Photos')!.folderId;

      expect(await saveName.isDisabled()).toBe(true);
      expect(await saveFolder.isDisabled()).toBe(true);
      await nameInput.fill('lighthouse.png');
      expect(await saveName.isEnabled()).toBe(true);
      expect(await saveName.getAttribute('class')).toContain('cms-primary');
      expect(await saveFolder.isDisabled()).toBe(true);
      await nameInput.fill('small.png');
      expect(await saveName.isDisabled()).toBe(true);
      await nameInput.fill('lighthouse.png');
      await page.getByRole('button', { name: 'Browse folders', exact: true }).click();
      await page.getByRole('dialog', { name: 'Folder', exact: true })
        .getByRole('button', { name: 'Photos', exact: true }).click();
      expect(await saveFolder.isEnabled()).toBe(true);
      expect(await saveFolder.getAttribute('class')).toContain('cms-primary');
      await saveName.click();
      await page.getByRole('dialog', { name: 'Change file address', exact: true })
        .getByRole('button', { name: 'Update links', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Renamed small.png to lighthouse.png successfully.' }).waitFor();
      await page.getByRole('heading', { name: 'Rename file: lighthouse.png', exact: true }).waitFor();
      expect(await page.locator('.file-variants').innerText()).toContain('lighthouse.png');
      expect((await operations.browse.file({ siteId, fileId: ownedFile.fileId })).folderId).toBeNull();
      expect(await saveName.isDisabled()).toBe(true);
      expect(await folderInput.inputValue()).toBe(photos);
      expect(await saveFolder.isEnabled()).toBe(true);
      await nameInput.fill('not-saved.png');
      await saveFolder.click();
      await page.getByRole('dialog', { name: 'Change file address', exact: true })
        .getByRole('button', { name: 'Update links', exact: true }).click();
      await page.getByText('Folder saved.', { exact: true }).waitFor();
      expect(await operations.browse.file({ siteId, fileId: ownedFile.fileId })).toMatchObject({
        name: 'lighthouse.png', folderId: photos,
      });
      expect(await nameInput.inputValue()).toBe('not-saved.png');
      expect(await saveName.isEnabled()).toBe(true);
      expect(await saveFolder.isDisabled()).toBe(true);
      await nameInput.fill('lighthouse.png');
      expect(await saveName.isDisabled()).toBe(true);
      await page.reload();
      await page.getByRole('heading', { name: 'Rename file: lighthouse.png', exact: true }).waitFor();
      expect(await folderInput.inputValue()).toBe(photos);
      expect(await breadcrumbs.locator('[aria-current="page"]').innerText()).toBe('lighthouse.png');
      await filesLink.click();
      await page.waitForURL(origin + filesPath);
      await page.getByRole('heading', { name: '/Photos', exact: true, level: 1 }).waitFor();
      await page.getByRole('link', { name: 'lighthouse.png', exact: true }).click();
      await page.getByRole('button', { name: 'Copy picture', exact: true }).click();
      expect(await page.locator('.file-code textarea').inputValue()).toContain('<picture>');
      expect(await page.locator('.file-code textarea').inputValue()).toContain('width="24" height="16"');
      expect(await page.locator('.file-code textarea').inputValue()).toContain('/Photos/lighthouse.png');
      await page.getByRole('button', { name: 'Delete image', exact: true }).click();
      await page.getByRole('button', { name: 'Force delete', exact: true }).waitFor();
      await page.screenshot({ path: path.resolve('.tmp/files-desktop.png'), fullPage: true });
      await page.getByRole('button', { name: 'Force delete', exact: true }).click();
      await page.locator('.file-upload input[type=file]').waitFor({ state: 'attached' });
      expect((await operations.list.execute({ siteId })).files.some((item) => item.fileId === ownedFile.fileId))
        .toBe(false);
      expect(dialogs).toBe(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'File tree', exact: true }).click();
      await page.getByRole('button', { name: 'assets/images', exact: true }).click();
      await page.locator('.file-upload input[type=file]').setInputFiles([{
        name: 'browser.png', mimeType: 'image/png', buffer: await png(40, 20),
      }]);
      await page.locator('._file-upload-row select').selectOption('Original');
      await page.getByRole('button', { name: 'Upload images', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.file-upload ._file-upload-row'));
      await page.getByRole('link', { name: 'browser.png', exact: true }).click();
      await filesLink.waitFor();
      await page.screenshot({ path: path.resolve('.tmp/files-breadcrumbs-mobile.png') });
      await filesLink.click();
      await page.waitForURL(origin + filesPath);
      await page.getByRole('link', { name: 'browser.png', exact: true }).waitFor();
      await page.screenshot({ path: path.resolve('.tmp/files-mobile.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  }, 30000);

  it('resumes journaled output and cleanup failures without reprocessing an image', async () => {
    const store = local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE);
    const projection = local.get<FileLibraryProjectionAdapter>(FILE_LIBRARY_PROJECTION);
    const storage = local.get<FileAssetStorageAdapter>(ASSET_STORAGE);
    let previous = await operations.list.execute({ siteId });

    previous = await operations.upload.execute({
      siteId,
      expectedVersion: previous.version,
      filename: 'reconcile-source.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(), 'image/png'),
    });
    const file = previous.files.find((item) => item.name === 'reconcile-source.png')!;
    const image = (await store.read(siteId)).library.files.find((item) => item.fileId === file.fileId)!.image;
    const install = vi.spyOn(projection, 'installChange').mockRejectedValueOnce(new Error('output unavailable'));

    try {
      await expect(operations.move.execute({
        siteId, expectedVersion: previous.version, fileId: file.fileId, folderId: null, name: 'recovered.png',
      })).rejects.toMatchObject({ cause: new Error('output unavailable') });
      expect((await store.read(siteId)).pending).toBe(true);
      expect((await fetch(origin + file.outputs[0]!.url)).status).toBe(200);
      const recovered = await operations.reconcile.execute({ siteId });

      expect(recovered.pending).toBe(false);
      const recoveredFile = await operations.browse.file({ siteId, fileId: file.fileId });
      const beforeDelete = await operations.list.execute({ siteId });

      expect((await fetch(origin + recoveredFile.outputs[0]!.url)).status).toBe(200);
      expect((await store.read(siteId)).library.files.find((item) => item.fileId === file.fileId)!.image.assetVersion)
        .toBe(image.assetVersion);
      const remove = vi.spyOn(storage, 'delete').mockRejectedValueOnce(new Error('cleanup unavailable'));

      try {
        await expect(operations.delete.execute({
          siteId, expectedVersion: recovered.version, fileId: file.fileId, force: true,
        })).rejects.toMatchObject({ cause: new Error('cleanup unavailable') });
        expect((await store.read(siteId)).pending).toBe(true);
        await operations.reconcile.execute({ siteId });
        expect((await operations.list.execute({ siteId })).files)
          .toEqual(beforeDelete.files.filter((item) => item.fileId !== file.fileId));
        await expect(readFile(path.join(root, 'data/127.0.0.1/.private/objects',
          ...image.original.contentId.split('/').slice(2))))
          .rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        remove.mockRestore();
      }
    } finally {
      install.mockRestore();
    }
  });

  it('migrates existing immutable objects from the previous tree and rebuilds named output idempotently', async () => {
    const legacySiteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'Legacy', primaryDomain: 'legacy.test',
    })).siteId;
    const library = await operations.upload.execute({
      siteId: legacySiteId,
      expectedVersion: '0',
      folderId: null,
      filename: 'legacy.png',
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(20, 10), 'image/png'),
    });
    const image = (await local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE).read(legacySiteId)).library.files[0]!.image;
    const legacyRoot = path.join(root, 'old-media');

    for (const reference of [image.original, image.file!]) {
      const old = path.join(legacyRoot, reference.contentId);
      const current = path.join(root, 'data/legacy.test/.private/objects', ...reference.contentId.split('/').slice(2));

      await mkdir(path.dirname(old), { recursive: true });
      await writeFile(old, await readFile(current));
      await unlink(current);
    }
    await unlink(path.join(root, 'data/legacy.test/images/legacy.png'));
    const settings = {
      mongoUri: process.env.ZARYA_TEST_MONGO_URI!,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      media: { root: path.join(root, 'data'), publicBaseUrl: '/assets' },
    };

    expect(await migrateMediaLayout(settings, legacyRoot)).toBe(2);
    expect(await migrateMediaLayout(settings, legacyRoot)).toBe(0);
    expect((await publicGet(library.files[0]!.outputs[0]!.url, 'legacy.test')).status).toBe(200);
    expect(await readFile(path.join(legacyRoot, image.original.contentId))).toBeInstanceOf(Buffer);
  });

  it('fits Files labels on one line without hiding the file extension', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const siteId = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'FilesLabels', primaryDomain: 'files-labels.test',
    })).siteId;
    const folder = await operations.createFolder.execute({
      siteId, expectedVersion: '0', parentId: null, name: 'Label test folder',
    });

    await operations.upload.execute({
      siteId,
      expectedVersion: folder.version,
      filename: 'tiny.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(16, 8), 'image/png'),
    });
    const cases = [
      ['long-long-long-long-file-01.png', '-01.png'],
      ['long-long-long-long-file-01.not-an-ext.png', 'ext.png'],
      ['long-long-long-long-file-01.not-an-ext..png', 'ext..png'],
      ['A\u0308-long-long-long-long-nLe\u0301.png', 'nLe\u0301.png'],
    ] as const;
    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const base = '/api/admin/sites/' + siteId + '/files';

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        url: origin + '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      await page.route((url) => url.pathname === base && !url.searchParams.has('foldersOnly'), async (route) => {
        const response = await route.fetch();
        const data: IMediaLibraryView = await response.json();
        const files = [...data.files, ...cases.map(([name], index) => ({
          ...data.files[0]!, fileId: 'fitted-' + index, name, outputs: [],
        }))];

        await route.fulfill({
          response,
          json: {
            ...data,
            files,
            fileTotal: files.length,
            total: data.folders.length + files.length,
          },
        });
      });
      await page.goto(origin + '/admin/sites/' + siteId + '/files');
      const manager = page.locator('#files-workspace .file-browser');
      const search = manager.getByRole('searchbox');
      const folderTitle = manager.getByTitle('Label test folder', { exact: true });

      for (const [width, fontSize] of [[1440, '14px'], [768, '14px'], [390, '13px']] as const) {
        await page.setViewportSize({ width, height: 960 });

        if (width === 768) {
          await page.getByRole('button', { name: 'assets/images', exact: true }).click();
        }
        await search.waitFor();
        await folderTitle.waitFor();
        expect(await folderTitle.evaluate((element) => getComputedStyle(element).fontSize)).toBe(fontSize);

        for (const [name, suffix] of cases) {
          const title = manager.getByRole('link', { name, exact: true }).getByTitle(name, { exact: true });
          const fitted = title.locator('._ellipsis-visible');

          await expect.poll(() => fitted.textContent({ timeout: 2000 })).toMatch(/\.\.\./u);
          const visible = (await fitted.textContent())!;

          expect(visible.startsWith(name.startsWith('A') ? 'A\u0308' : 'l')).toBe(true);
          expect(visible.endsWith(suffix)).toBe(true);
          await expect.poll(() => fitted.evaluate((element) => ({
            fontSize: getComputedStyle(element).fontSize, fits: element.scrollWidth <= element.clientWidth,
          }))).toEqual({ fontSize, fits: true });
        }
        const short = manager.getByRole('link', { name: 'tiny.png', exact: true }).locator('._ellipsis-visible');

        expect(await short.textContent()).toBe('tiny.png');
      }
    } finally {
      await context.close();
      await browser.close();
    }
  }, 60_000);

  it('opens Files in Chrome at 100,000 files without requesting the complete catalogue', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const bulk = (await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'BrowserBulk', primaryDomain: 'browser-bulk.test',
    })).siteId;
    const initial = await operations.upload.execute({
      siteId: bulk,
      expectedVersion: '0',
      filename: 'seed.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(await png(16, 8, '#688199'), 'image/png'),
    });
    const stored = await local.get<IMediaLibraryStore>(FILE_LIBRARY_STORE).locate(bulk, initial.files[0]!.fileId);

    expect(stored).not.toBeNull();
    const seed = stored!.file;
    const rows = mediaRecords(connection).files;
    const library = { siteId: bulk, version: initial.version, folders: [], files: [] };

    for (let count = 0; count < 99_999; count += 1_000) {
      await rows.insertMany(Array.from({ length: Math.min(1_000, 99_999 - count) }, (_, offset) => {
        const index = String(count + offset).padStart(6, '0');

        return fileRecord(library, { ...seed, fileId: 'fixture-' + index, name: index + '.png' });
      }));
    }
    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const token = cookie.slice(cookie.indexOf('=') + 1);
    const base = '/api/admin/sites/' + bulk + '/files';
    const full = vi.fn();

    try {
      await context.addCookies([{
        name: 'zarya_admin_session', value: token, url: origin + '/api/admin', httpOnly: true, sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.on('request', (request) => {
        const url = new URL(request.url());

        if (request.method() === 'GET' && url.pathname === base && !url.search) {
          full();
        }
      });
      const observed = page.waitForResponse((response) => {
        const url = new URL(response.url());

        return url.pathname === base && url.searchParams.get('root') === 'images'
          && !url.searchParams.has('foldersOnly');
      });
      const started = performance.now();

      await page.goto(origin + '/admin/sites/' + bulk + '/files');
      const response = await observed;

      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ total: 100_000 });
      expect(new URL(response.url()).searchParams.get('pageSize')).toBe('25');
      const files = page.locator('#files-workspace .file-browser');

      await files.getByRole('link', { name: '000000.png', exact: true }).waitFor();
      expect(await files.getByRole('link').count()).toBe(25);
      expect(full).not.toHaveBeenCalled();
      console.info(JSON.stringify({
        browserFiles: 100_000, shown: 25, readyMs: Math.round(performance.now() - started),
      }));
      const pager = files.getByRole('navigation', { name: 'File pages', exact: true });
      const previous = pager.getByRole('button', { name: 'Previous', exact: true });
      const nextPage = pager.getByRole('button', { name: 'Next', exact: true });
      const checkbox = files.getByRole('checkbox', { name: 'Include subfolders', exact: true });
      const [bar, back, status, next, check] = await Promise.all([
        pager.boundingBox(), previous.boundingBox(), pager.getByRole('status').boundingBox(),
        nextPage.boundingBox(), checkbox.boundingBox(),
      ]);

      expect(check!.width).toBe(20);
      expect(check!.height).toBe(20);
      expect((back!.x + next!.x + next!.width) / 2).toBeCloseTo(bar!.x + bar!.width / 2, 0);
      expect(status!.y + status!.height / 2).toBeCloseTo(back!.y + back!.height / 2, 0);
      expect(status!.y + status!.height / 2).toBeCloseTo(next!.y + next!.height / 2, 0);
      expect(await files.getByRole('combobox').count()).toBe(1);
      const refresh = files.getByRole('button', { name: 'Refresh', exact: true });
      const search = files.getByRole('searchbox');
      const sort = files.getByRole('combobox', { name: 'Sort', exact: true });
      const list = files.getByRole('button', { name: 'List', exact: true });

      await list.click();
      const first = files.getByRole('link', { name: '000000.png', exact: true });
      const before = await first.boundingBox();
      let signalIntercept!: () => void;
      let finish!: () => void;
      const intercepted = new Promise<void>((resolve) => {
        signalIntercept = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });

      await page.route((url) => url.pathname === base && !url.searchParams.has('foldersOnly'), async (route) => {
        signalIntercept();
        await pending;
        await route.fulfill({ status: 500, json: { error: 'InternalError' } });
      }, { times: 1 });

      try {
        await refresh.click();
        await intercepted;
        const overlay = files.locator('.page-saving-overlay');

        await overlay.waitFor({ timeout: 2000 });
        const spinner = overlay.locator('._saving-spinner');
        const geometry = async (): Promise<{ dx: number; dy: number; tint: string }> => page.evaluate(() => {
          const cover = document.querySelector('#files-workspace .file-browser .page-saving-overlay')!;
          const bounds = cover.getBoundingClientRect();
          const viewport = cover.closest('._workspace-scroll')!.getBoundingClientRect();
          const indicator = cover.querySelector('._saving-spinner')!.getBoundingClientRect();

          return {
            dx: Math.abs(indicator.left + indicator.width / 2 - (bounds.left + bounds.right) / 2),
            dy: Math.abs(indicator.top + indicator.height / 2
              - (Math.max(bounds.top, viewport.top) + Math.min(bounds.bottom, viewport.bottom)) / 2),
            tint: getComputedStyle(cover).backgroundColor,
          };
        });

        expect(await spinner.isVisible()).toBe(true);
        expect(await files.locator('._visually-hidden[role="status"]').textContent()).toMatch(/loading files/i);
        expect(await files.locator('._file-result-content').getAttribute('aria-busy')).toBe('true');
        expect(await first.boundingBox()).toEqual(before);
        expect(await search.isEnabled()).toBe(true);
        const [searchBox, sortBox, refreshBox] = await Promise.all([
          search.boundingBox(), sort.boundingBox(), refresh.boundingBox(),
        ]);

        expect(searchBox!.height).toBe(36);
        expect(searchBox!.width).toBeLessThanOrEqual(280);
        expect(sortBox!.height).toBe(36);
        expect(sortBox!.width).toBeLessThan(170);
        expect(refreshBox!.height).toBe(36);
        expect(Math.abs(searchBox!.y - refreshBox!.y)).toBeLessThan(1);
        expect((await geometry()).tint).toMatch(/(?:0\.18|\/ 0\.18)/);
        const centered = { dx: expect.closeTo(0, 0), dy: expect.closeTo(0, 0) };

        await vi.waitFor(async () => expect(await geometry()).toMatchObject(centered));
        const workspaceScroll = page.locator('#files-workspace ._workspace-scroll:visible');

        expect(await workspaceScroll.evaluate((element) => {
          element.scrollTop += 250;

          return element.scrollTop;
        })).toBeGreaterThan(0);
        await vi.waitFor(async () => expect(await geometry()).toMatchObject(centered));
        await page.screenshot({ path: path.resolve('.tmp/files-refresh-overlay.png') });
      } finally {
        finish();
      }

      await files.getByRole('alert').waitFor();
      expect(await files.locator('.page-saving-overlay').count()).toBe(0);
      expect(await files.getByRole('link').count()).toBe(25);
      await refresh.click();
      await files.getByRole('alert').waitFor({ state: 'detached' });
      await vi.waitFor(async () => expect(await refresh.isEnabled()).toBe(true));
      await files.getByRole('button', { name: 'Grid', exact: true }).click();
      await pager.screenshot({ path: path.resolve('.tmp/files-pager-centered.png') });
      await nextPage.click();
      await files.getByRole('link', { name: '000025.png', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const settings = page.getByRole('combobox', { name: 'Files per page in the media library', exact: true });

      await settings.waitFor();
      expect(await settings.inputValue()).toBe('25');
      await settings.selectOption('50');
      const configuredPage = page.waitForResponse((reply) => {
        const url = new URL(reply.url());

        return url.pathname === base && url.searchParams.get('root') === 'images'
          && url.searchParams.get('page') === '1' && url.searchParams.get('pageSize') === '50'
          && !url.searchParams.has('foldersOnly');
      });

      await page.getByRole('button', { name: 'Files', exact: true }).click();
      expect((await configuredPage).status()).toBe(200);
      await files.getByRole('link', { name: '000049.png', exact: true }).waitFor();
      expect(await files.getByRole('link').count()).toBe(50);
      await page.reload();
      await files.getByRole('link', { name: '000049.png', exact: true }).waitFor();
      expect(await files.getByRole('link').count()).toBe(50);
      expect(full).not.toHaveBeenCalled();
    } finally {
      await context.close();
      await browser.close();
    }
  }, 120_000);
});
