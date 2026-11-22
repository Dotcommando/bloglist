import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';
import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { ImageUploadMode } from '../../src/domain/media/file-library.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PublishedVersionPosition } from '../../src/domain/pages/published-page-version.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { FILE_LIBRARY_OPERATIONS } from '../../src/infra/media/media.tokens.js';
import { UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { CREATE_PAGE, GET_PAGE, RESTORE_PAGE_VERSION } from '../../src/infra/pages/pages.tokens.js';
import { GET_PUBLISHED_ARTIFACT, RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import { PUBLISH_CURRENT_PAGE } from '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT, UPDATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { TV_OPERATIONS } from '../../src/infra/template-variables/template-variables.tokens.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IRestorePageVersion } from '../../src/ports/inbound/pages/restore-page-version.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IGetPublishedArtifact } from '../../src/ports/inbound/publication/get-published-artifact.port.js';
import type { IPublishCurrentPage } from '../../src/ports/inbound/publication/publish-current-page.port.js';
import type {
  ICreateRenderingElement,
  IUpdateRenderingElement,
} from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type {
  ITemplateVariableOperations,
} from '../../src/ports/inbound/template-variables/template-variables.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { siteInput } from '../support/sites.js';

it('persists/restores TV values and republishes Snippet consumers without exposing drafts', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated test MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/template-variables-'));
  const connection = await createConnection(mongoUri, {
    dbName: database,
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  let app: Awaited<ReturnType<typeof createLocalApplication>> | undefined;

  async function cleanupDatabase(): Promise<void> {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe test database cleanup');
    }
    await connection.dropDatabase();
  }

  try {
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    app = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'synthetic', platformAdministrator: true },
      media: { root: path.join(root, 'data'), publicBaseUrl: '/assets' },
      rendering: { sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts') },
    });
    const site = await app.get<ICreateSite>(CREATE_SITE).execute(siteInput());
    const siteId = site.siteId;
    const tv = app.get<ITemplateVariableOperations>(TV_OPERATIONS);
    const snippet = await app.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId,
      kind: TemplateSourceKind.Snippet,
      name: 'TVMessage',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: [],
      snippet: {
        code: 'return { text: "Old snippet" };',
        phases: [LoaderPhase.Build],
        output: {
          name: 'result',
          kind: ParameterKind.Object,
          required: true,
          properties: [{ name: 'text', kind: ParameterKind.String, required: true }],
        },
      },
    });
    const elementContent = {
      name: 'TV template',
      html: '<!doctype html><html><head><title>[[*title]]</title></head><body>[[*note]]'
        + '[[TVMessage? &as=`message`]][[+message.text]]</body></html>',
      css: '',
      browserTypeScript: null,
      parameters: [],
    };
    const template = await app.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId, kind: TemplateSourceKind.Template, ...elementContent,
    });
    const definition = {
      name: 'note',
      caption: 'Note',
      description: '',
      kind: TemplateVariableKind.Text,
      required: true,
      sortOrder: 100,
      templateIds: [template.key],
      defaultValue: 'Frozen default',
    };

    await tv.save.execute({ siteId, expectedVersion: '0', fields: [definition] });
    const page = await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId,
      mark: 'TvPage',
      language: 'EN',
      title: 'TV page',
    });
    let details = await tv.getPage.execute({ siteId, pageId: page.pageId });

    await tv.savePage.execute({
      siteId,
      pageId: page.pageId,
      templateId: template.key,
      values: {},
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: details.mediaVersion,
    });
    const publish = app.get<IPublishCurrentPage>(PUBLISH_CURRENT_PAGE);

    await publish.execute({ siteId, pageId: page.pageId, actorId: 'synthetic', templateId: template.key, path: '/' });
    const catalog = await tv.list.execute({ siteId });

    await tv.save.execute({
      siteId,
      expectedVersion: catalog.version,
      fields: [{
        ...definition,
        defaultValue: 'New default',
      }],
    });
    await app.get<IRestorePageVersion>(RESTORE_PAGE_VERSION).execute({
      siteId,
      pageId: page.pageId,
      version: PublishedVersionPosition.Latest,
    });
    expect((await app.get<IGetPage>(GET_PAGE).execute({ siteId, pageId: page.pageId }))?.toState().tvValues)
      .toEqual({ note: 'Frozen default' });
    details = await tv.getPage.execute({ siteId, pageId: page.pageId });
    await tv.savePage.execute({
      siteId,
      pageId: page.pageId,
      templateId: template.key,
      values: { note: null },
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: details.mediaVersion,
    });
    await expect(publish.execute({
      siteId,
      pageId: page.pageId,
      actorId: 'synthetic',
      templateId: template.key,
      path: '/',
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId: page.pageId, title: 'NEVER_PUBLIC' });
    const activation = app.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const before = await activation.getActive(siteId);

    await app.get<IUpdateRenderingElement>(UPDATE_RENDERING_ELEMENT).execute({
      ...snippet,
      snippet: { ...snippet.snippet!, code: 'return { text: "New snippet" };' },
      expectedVersion: snippet.version,
    });
    const after = await activation.getActive(siteId);

    expect(after?.releaseId).not.toBe(before?.releaseId);
    const output = await app.get<IGetPublishedArtifact>(GET_PUBLISHED_ARTIFACT).execute({
      siteId, releaseId: after!.releaseId, path: 'index.html',
    });
    const chunks: Uint8Array[] = [];

    for await (const chunk of output!.content.bytes) {
      chunks.push(chunk);
    }
    const html = Buffer.concat(chunks).toString('utf8');

    expect(html).toContain('Frozen default');
    expect(html).toContain('New snippet');
    expect(html).not.toContain('NEVER_PUBLIC');
    await expect(tv.savePage.execute({
      siteId,
      pageId: page.pageId,
      templateId: template.key,
      values: {},
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: details.mediaVersion,
    }))
      .rejects.toMatchObject({ code: 'Conflict' });
    const currentCatalog = await tv.list.execute({ siteId });
    const imageField = {
      ...definition,
      name: 'photo',
      kind: TemplateVariableKind.Image,
      required: false,
      defaultValue: null,
    };

    await tv.save.execute({
      siteId,
      expectedVersion: currentCatalog.version,
      fields: [...currentCatalog.fields, imageField],
    });
    const files = app.get<IFileLibraryOperations>(FILE_LIBRARY_OPERATIONS);
    const bytes = await sharp({ create: { width: 96, height: 32, channels: 3, background: '#448866' } })
      .png().toBuffer();
    let library = await files.upload.execute({
      siteId,
      filename: 'photo.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      expectedVersion: '0',
      content: assetBinary(bytes, 'image/png'),
    });
    const imageId = library.files[0]!.fileId;

    details = await tv.getPage.execute({ siteId, pageId: page.pageId });
    await tv.savePage.execute({
      siteId,
      pageId: page.pageId,
      templateId: template.key,
      values: { ...details.values, photo: { kind: 'Image', fileId: imageId, mode: 'Responsive', alt: 'Test' } },
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: details.mediaVersion,
    });
    details = await tv.getPage.execute({ siteId, pageId: page.pageId });
    library = await files.move.execute({
      siteId,
      fileId: imageId,
      name: 'renamed.png',
      folderId: null,
      expectedVersion: library.version,
    });
    expect((await tv.getPage.execute({ siteId, pageId: page.pageId })).prepared.photo)
      .toMatchObject({ src: '/assets/images/renamed.png', width: 96, height: 32, missing: false });
    await expect(tv.savePage.execute({
      siteId,
      pageId: page.pageId,
      templateId: template.key,
      values: details.values,
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: details.mediaVersion,
    }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await files.delete.execute({ siteId, fileId: imageId, force: true });
    details = await tv.getPage.execute({ siteId, pageId: page.pageId });
    expect(details.prepared.photo).toMatchObject({ missing: true });
    await tv.savePage.execute({
      siteId,
      pageId: page.pageId,
      templateId: template.key,
      values: details.values,
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: details.mediaVersion,
    });
  } finally {
    await app?.close();

    await cleanupDatabase();
    await connection.close();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
}, 30000);
