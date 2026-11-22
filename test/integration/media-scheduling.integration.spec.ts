import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection, createConnection } from 'mongoose';
import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { FileAssetStorageAdapter } from '../../src/adapters/outbound/storage/files/media/asset-storage.adapter.js';
import { AssetVisibility } from '../../src/domain/media/asset.js';
import { AppModule } from '../../src/infra/app.module.js';
import { ASSET_STORAGE, GET_ASSET, PROCESS_ASSET, UPLOAD_ASSET } from '../../src/infra/media/media.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IGetAsset } from '../../src/ports/inbound/media/get-asset.port.js';
import type { IProcessAsset } from '../../src/ports/inbound/media/process-asset.port.js';
import type { IUploadAsset } from '../../src/ports/inbound/media/upload-asset.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { siteInput } from '../support/sites.js';

describe('media through clean CMS composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplicationContext;
  let root: string;
  let siteId: string;
  let otherSiteId: string;

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-batch-five-'));
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    app = await NestFactory.createApplicationContext(AppModule.forLocalOperator({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      media: { root: path.join(root, 'data'), publicBaseUrl: '/media' },
      rendering: { sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts') },
    }),
    { logger: false, abortOnError: false });
    const site = await app.get<ICreateSite>(CREATE_SITE).execute(siteInput());

    siteId = site.siteId;
    otherSiteId = (await app.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'Other', primaryDomain: 'other.test',
    })).siteId;

  });
  afterAll(async () => {
    await app?.close();

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
    if (root && path.resolve(root).startsWith(path.resolve(os.tmpdir(), 'zarya-batch-five-'))) {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('uploads, processes and reads real proportional WebP assets with private originals', async () => {
    const original = await sharp({
      create: { width: 1000, height: 400, channels: 4, background: '#f005' },
    }).png().toBuffer();
    const receipt = await app.get<IUploadAsset>(UPLOAD_ASSET).execute({
      siteId,
      actorId: 'operator',
      filename: 'image.png',
      visibility: AssetVisibility.Public,
      content: assetBinary(original, 'text/plain'),
    });
    const get = app.get<IGetAsset>(GET_ASSET);
    const uploaded = await get.execute({ siteId, actorId: 'operator', ...receipt });

    if (!uploaded) {
      throw new Error('Missing upload');
    }

    const process = app.get<IProcessAsset>(PROCESS_ASSET);
    const results = await Promise.allSettled([0, 1].map(() => process.execute({
      siteId,
      ...receipt,
      expectedVersion: uploaded.toState().version,
    })));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const ready = await get.execute({ siteId, actorId: 'operator', ...receipt });

    expect(ready?.toState().state).toBe('Ready');
    const variant = ready?.toState().variants.find((v) => v.dimensions.width === 833);

    if (!variant) {
      throw new Error('Missing 1200 profile');
    }
    expect(variant.dimensions.height).toBe(333);
    expect(await sharp(await readFile(path.join(root, 'data', siteInput().primaryDomain, 'images/.objects',
      ...variant.content.contentId.split('/').slice(2)))).metadata())
      .toMatchObject({ format: 'webp', width: 833, height: 333 });
    expect(await get.execute({ siteId: otherSiteId, actorId: 'operator', ...receipt })).toBeNull();
    await expect(get.execute({ siteId, actorId: 'foreign', ...receipt })).rejects.toMatchObject({ code: 'Forbidden' });
    const storage = app.get<FileAssetStorageAdapter>(ASSET_STORAGE);

    await expect(storage.publicUrl(siteId, uploaded.toState().original)).rejects.toThrow();
    expect(await readFile(path.join(root, 'data', siteInput().primaryDomain, '.private/objects',
      ...uploaded.toState().original.contentId.split('/').slice(2)))).toEqual(original);
    expect((await process.execute({ siteId, ...receipt, expectedVersion: 'old' })).toState()).toEqual(ready?.toState());
  });
  it.each([['notes.csv', 'name,value\nA,1\n', 'text/csv'],
    ['document.pdf', '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'application/pdf'],
    ['logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0"/></svg>', 'image/svg+xml']])(
    'keeps attachment %s usable without raster variants', async (filename, source, mime) => {
      const receipt = await app.get<IUploadAsset>(UPLOAD_ASSET).execute({
        siteId,
        actorId: 'operator',
        filename,
        visibility: AssetVisibility.Public,
        content: assetBinary(Buffer.from(source), mime),
      });
      const uploaded = await app.get<IGetAsset>(GET_ASSET).execute({ siteId, actorId: 'operator', ...receipt });

      if (!uploaded) {
        throw new Error('Missing upload');
      }

      const ready = await app.get<IProcessAsset>(PROCESS_ASSET).execute({
        siteId,
        ...receipt,
        expectedVersion: uploaded.toState().version,
      });

      expect(ready.toState()).toMatchObject({
        state: 'Ready',
        variants: [],
        originalDimensions: mime === 'image/svg+xml' ? { width: 10, height: 10, aspectRatio: 1 } : null,
      });
      expect(ready.toState().file).toBeDefined();
    });
});
