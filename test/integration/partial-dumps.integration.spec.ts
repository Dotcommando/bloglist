import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { mediaRecords } from '../../src/adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import { ImageUploadMode } from '../../src/domain/media/image-upload-mode.enum.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { paginationSnippetSource } from '../../src/domain/rendering/pagination-snippet.js';
import { CREATE_SITE_DUMP, GET_SITE_DUMP, IMPORT_SITE_DUMP, INSPECT_SITE_DUMP, RESTORE_SITE_DUMP }
  from '../../src/infra/dumps/dumps.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { FILE_LIBRARY_OPERATIONS } from '../../src/infra/media/media.tokens.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateSiteDump, IGetSiteDump, IImportSiteDump, IInspectSiteDump, IRestoreSiteDump }
  from '../../src/ports/inbound/dumps/site-dumps.port.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { siteInput } from '../support/sites.js';

describe('portable category dumps with isolated storage', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let local: INestApplicationContext;
  let root: string;
  let source: string;
  let target: string;
  const actorId = 'partial-test';

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/partial-dumps-'));
    local = await createLocalApplication({
      mongoUri,
      database,
      dumpsRoot: path.join(root, 'dumps'),
      rendering: { sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts') },
      media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
      operator: { operatorId: actorId, platformAdministrator: true },
    });
    const sites = local.get<ICreateSite>(CREATE_SITE);

    source = (await sites.execute({ ...siteInput(), mark: 'Source', primaryDomain: 'source.test' })).siteId;
    target = (await sites.execute({ ...siteInput(), mark: 'Target', primaryDomain: 'target.test' })).siteId;
  });

  afterAll(async () => {
    await local?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Unsafe test DB');
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

  async function transferred(type: SiteDumpType, itemIds?: readonly string[]): Promise<string> {
    const dump = await local.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute({
      siteId: source,
      actorId,
      options: { type, ...(itemIds ? { itemIds } : {}) },
    });
    const downloaded = await local.get<IGetSiteDump>(GET_SITE_DUMP).execute({
      siteId: source,
      actorId,
      filename: dump.filename,
    });
    const chunks = [];

    for await (const bytes of downloaded.content.bytes) {
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);

    if (type === SiteDumpType.Chunks) {
      const text = gunzipSync(bytes).toString();

      expect(text).not.toContain('"kind":"document"');
      expect(text).not.toContain('"kind":"Snippet"');
    }

    const imported = await local.get<IImportSiteDump>(IMPORT_SITE_DUMP).execute({
      siteId: target,
      actorId,
      content: {
        byteSize: bytes.length,
        mimeType: 'application/gzip',
        bytes: (async function* () {
          yield bytes;
        })(),
      },
    });

    return imported.filename;
  }

  it('exports only checked chunks and replaces only the checked same-name target without publication', async () => {
    const previousPublication = await connection.db!.collection('active_publications').findOne({ siteId: target });
    const create = local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT);
    const shared = { kind: TemplateSourceKind.Chunk, css: '', browserTypeScript: null, parameters: [] };
    const first = await create.execute({ ...shared, siteId: source, name: 'Header', html: '<p>imported</p>' });
    const skipped = await create.execute({ ...shared, siteId: source, name: 'Skipped', html: '<p>skip</p>' });
    const existing = await create.execute({ ...shared, siteId: target, name: 'Header', html: '<p>old</p>' });
    const other = await create.execute({ ...shared, siteId: target, name: 'Other', html: '<p>retained</p>' });
    const filename = await transferred(SiteDumpType.Chunks, [first.elementId, skipped.elementId]);
    const review = await local.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute({ siteId: target, actorId, filename });

    expect(review.type).toBe(SiteDumpType.Chunks);
    expect(review.items).toHaveLength(2);
    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      siteId: target,
      actorId,
      filename,
      options: { version: review.version, choices: [{ id: first.elementId, targetId: existing.elementId }] },
    });
    const elements = connection.db!.collection('rendering_elements');

    expect(await elements.findOne({ siteId: target, key: existing.key })).toMatchObject({
      _id: existing.elementId, html: '<p>imported</p>', name: 'Header',
    });
    expect(await elements.findOne({ siteId: target, key: other.key })).toMatchObject({ html: '<p>retained</p>' });
    expect(await elements.countDocuments({ siteId: target, name: 'Skipped' })).toBe(0);
    expect(await connection.db!.collection('active_publications').findOne({ siteId: target }))
      .toEqual(previousPublication);
  });

  it('merges all physical files, replaces collisions and retains target-only files', async () => {
    await writeFile(path.join(root, 'media', 'source.test', 'files', 'shared.txt'), 'imported bytes');
    await writeFile(path.join(root, 'media', 'source.test', 'files', 'new.txt'), 'new bytes');
    await writeFile(path.join(root, 'media', 'target.test', 'files', 'shared.txt'), 'old bytes');
    await writeFile(path.join(root, 'media', 'target.test', 'files', 'retained.txt'), 'retained bytes');
    const filename = await transferred(SiteDumpType.Files);
    const review = await local.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute({ siteId: target, actorId, filename });

    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      siteId: target,
      actorId,
      filename,
      options: { version: review.version, choices: [] },
    });
    expect(await readFile(path.join(root, 'media', 'target.test', 'files', 'shared.txt'),
      'utf8')).toBe('imported bytes');
    expect(await readFile(path.join(root, 'media', 'target.test', 'files', 'new.txt'), 'utf8')).toBe('new bytes');
    expect(await readFile(path.join(root, 'media', 'target.test', 'files', 'retained.txt'),
      'utf8')).toBe('retained bytes');
  });

  it.each(Object.values(ImageUploadMode))('merges %s image metadata and objects consistently', async (mode) => {
    const operations = local.get<IFileLibraryOperations>(FILE_LIBRARY_OPERATIONS);
    const name = 'portable-' + mode.toLowerCase() + '.png';

    for (const siteId of [source, target]) {
      const library = await operations.list.execute({ siteId });
      const bytes = await sharp({
        create: {
          width: siteId === source ? 40 : 20,
          height: 10,
          channels: 4,
          background: '#123456',
        },
      }).png().toBuffer();

      await operations.upload.execute({
        siteId,
        expectedVersion: library.version,
        filename: name,
        mode,
        folderId: null,
        content: assetBinary(bytes, 'image/png'),
      });
    }
    const previous = (await operations.list.execute({ siteId: target })).files.find((file) => file.name === name)!;
    const filename = await transferred(SiteDumpType.Files);
    const review = await local.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute({ siteId: target, actorId, filename });

    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      siteId: target,
      actorId,
      filename,
      options: { version: review.version, choices: [] },
    });
    const library = await operations.list.execute({ siteId: target });
    const file = library.files.find((file) => file.name === name)!;

    expect(file.fileId).toBe(previous.fileId);
    expect(file.originalDimensions?.width).toBe(40);
    const content = await operations.readContent.execute({
      siteId: target,
      fileId: file.fileId,
      key: file.outputs[0]!.key,
    });
    const chunks = [];

    for await (const bytes of content.content.bytes) {
      chunks.push(bytes);
    }
    expect((await sharp(Buffer.concat(chunks)).metadata()).width).toBeGreaterThan(0);
    const stored = await mediaRecords(connection).files.findOne({ siteId: target, name }).lean().exec();
    const embedded = stored!.image;
    const assets = connection.db!.collection<{ _id: string; original: unknown; version: string }>('assets');
    const asset = await assets.findOne({
      siteId: target,
      assetId: embedded.assetId,
      _id: embedded.assetVersion,
    });

    expect(asset?.version).toBe(embedded.version);
    expect(asset?.original).toEqual(embedded.original);
  });

  it('rejects a stale review after the target changes', async () => {
    const filename = await transferred(SiteDumpType.Files);
    const input = { siteId: target, actorId, filename };
    const review = await local.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute(input);

    await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId: target,
      kind: TemplateSourceKind.Chunk,
      name: 'After review',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: [],
    });
    await expect(local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      ...input,
      options: { version: review.version, choices: [] },
    })).rejects.toMatchObject({ code: 'StaleWrite' });
  });

  it.each([
    { kind: TemplateSourceKind.Template, type: SiteDumpType.Templates },
    { kind: TemplateSourceKind.Snippet, type: SiteDumpType.Snippets },
  ])('transfers only the selected $type into a new target draft', async ({ kind, type }) => {
    const previousPublication = await connection.db!.collection('active_publications').findOne({ siteId: target });
    const create = local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT);
    const element = await create.execute({
      siteId: source,
      kind,
      name: 'Portable ' + kind,
      html: kind === TemplateSourceKind.Snippet ? '' : '<main>portable template</main>',
      css: '',
      browserTypeScript: null,
      parameters: [],
      ...(kind === TemplateSourceKind.Snippet ? { snippet: paginationSnippetSource } : {}),
    });
    const filename = await transferred(type, [element.elementId]);
    const input = { siteId: target, actorId, filename };
    const review = await local.get<IInspectSiteDump>(INSPECT_SITE_DUMP).execute(input);

    expect(review.items).toHaveLength(1);
    await local.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({
      ...input,
      options: { version: review.version, choices: [{ id: element.elementId, targetId: null }] },
    });
    const saved = await connection.db!.collection('rendering_elements').findOne({ siteId: target, name: element.name });

    expect(saved?.kind).toBe(kind);
    expect(saved?._id).not.toBe(element.elementId);
    expect(await connection.db!.collection('active_publications').findOne({ siteId: target }))
      .toEqual(previousPublication);
  });
});
