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
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { FILE_LIBRARY_OPERATIONS } from '../../src/infra/media/media.tokens.js';
import { CREATE_PAGE, GET_PAGE_EDITORIAL_STATES, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import {
  GET_PUBLISHED_ARTIFACT, PUBLICATION_STORE, PUBLISH_CURRENT_PAGE, PUBLISH_SITE_RELEASE,
  RELEASE_ACTIVATION,
} from '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { TV_OPERATIONS } from '../../src/infra/template-variables/template-variables.tokens.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPageEditorialStates } from '../../src/ports/inbound/pages/get-page-editorial-states.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IGetPublishedArtifact } from '../../src/ports/inbound/publication/get-published-artifact.port.js';
import type { IPublishCurrentPage } from '../../src/ports/inbound/publication/publish-current-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type {
  ITemplateVariableOperations,
} from '../../src/ports/inbound/template-variables/template-variables.port.js';
import type { IDataLoader } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { siteInput } from '../support/sites.js';

it('keeps catalog media and editorial state through full and incremental publication', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated test MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/editorial-publication-'));
  const connection = await createConnection(mongoUri, {
    dbName: database,
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  let app: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
  const catalog: IDataLoader = {
    id: 'CardCatalog',
    parameters: [],
    phases: [LoaderPhase.Build],
    output: {
      name: 'result',
      kind: ParameterKind.Object,
      required: true,
      properties: ['src', 'srcset', 'alt', 'teaser'].map((name) => ({
        name,
        kind: ParameterKind.String,
        required: true,
      })),
    },
    read: async (_input, context) => {
      const tv = context.publishedPages?.find((page) => page.path === '/game/')?.tv;
      const image = tv?.photo;

      return {
        src: image && typeof image === 'object' && 'src' in image ? image.src ?? '' : '',
        srcset: image && typeof image === 'object' && 'srcset' in image ? image.srcset ?? '' : '',
        alt: image && typeof image === 'object' && 'alt' in image ? image.alt ?? '' : '',
        teaser: tv?.teaser ?? '',
      };
    },
  };

  async function cleanupDatabase(): Promise<void> {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe cleanup');
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
      rendering: {
        sourcesRoot: path.join(root, 'sources'),
        artifactsRoot: path.join(root, 'artifacts'),
        loaders: [catalog],
      },
    });
    const site = await app.get<ICreateSite>(CREATE_SITE).execute(siteInput());
    const siteId = site.siteId;
    const templates = app.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT);
    const base = {
      siteId,
      kind: TemplateSourceKind.Template,
      css: 'main{color:#123456}',
      browserTypeScript: null,
      parameters: [],
    };
    const gameTemplate = await templates.execute({
      ...base,
      name: 'Game',
      html: '<!doctype html><html><head><title>[[*title]]</title></head><body><main>[[*title]]</main></body></html>',
    });
    const homeTemplate = await templates.execute({
      ...base,
      name: 'Catalog',
      html: '<!doctype html><html><head><title>[[*title]]</title></head><body><main>'
        + '[[CardCatalog? &as=`card`]]<img width="1440" height="720" src="[[+card.src]]" '
        + 'srcset="[[+card.srcset]]" alt="[[+card.alt]]">'
        + '<p>[[+card.teaser]]</p></main></body></html>',
    });
    const create = app.get<ICreatePage>(CREATE_PAGE);
    const game = await create.execute({ siteId, mark: 'Game', language: 'en', title: 'Public game' });
    const home = await create.execute({ siteId, mark: 'Home', language: 'en', title: 'Home' });
    const other = await create.execute({ siteId, mark: 'Other', language: 'en', title: 'Other' });
    const tv = app.get<ITemplateVariableOperations>(TV_OPERATIONS);

    await tv.save.execute({
      siteId,
      expectedVersion: '0',
      fields: [
        {
          name: 'photo',
          caption: 'Photo',
          description: '',
          kind: TemplateVariableKind.Image,
          required: false,
          sortOrder: 100,
          templateIds: [gameTemplate.key],
        },
        {
          name: 'teaser',
          caption: 'Teaser',
          description: '',
          kind: TemplateVariableKind.Text,
          required: false,
          sortOrder: 200,
          templateIds: [gameTemplate.key],
        },
        {
          name: 'defaultNote',
          caption: 'Default',
          description: '',
          kind: TemplateVariableKind.Text,
          required: false,
          sortOrder: 300,
          templateIds: [gameTemplate.key],
          defaultValue: 'Frozen shared default',
        },
      ],
    });
    const bytes = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: '#448866' },
    }).png().toBuffer();
    const library = await app.get<IFileLibraryOperations>(FILE_LIBRARY_OPERATIONS).upload.execute({
      siteId,
      filename: 'card.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      expectedVersion: '0',
      content: assetBinary(bytes, 'image/png'),
    });
    const details = await tv.getPage.execute({ siteId, pageId: game.pageId });

    await tv.savePage.execute({
      siteId,
      pageId: game.pageId,
      templateId: gameTemplate.key,
      values: {
        photo: { kind: 'Image', mode: 'Responsive', fileId: library.files[0]!.fileId, alt: 'Public card alt' },
        teaser: 'Public card teaser',
      },
      expectedUpdatedAt: details.updatedAt,
      catalogVersion: details.catalog.version,
      mediaVersion: library.version,
    });
    const publish = app.get<IPublishCurrentPage>(PUBLISH_CURRENT_PAGE);
    const editorial = app.get<IGetPageEditorialStates>(GET_PAGE_EDITORIAL_STATES);
    const activation = app.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const rebuild = app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE);

    expect((await editorial.execute({ siteId })).pages.filter((page) =>
      [game.pageId, home.pageId, other.pageId].includes(page.pageId))
      .every((page) => !page.hasPublishedVersion)).toBe(true);
    await publish.execute({
      siteId,
      pageId: game.pageId,
      actorId: 'synthetic',
      templateId: gameTemplate.key,
      path: '/game/',
    });
    expect((await editorial.execute({ siteId, pageId: game.pageId })).pages[0]?.changedFields).toEqual([]);
    await publish.execute({
      siteId,
      pageId: home.pageId,
      actorId: 'synthetic',
      templateId: homeTemplate.key,
      path: '/',
    });
    await publish.execute({
      siteId,
      pageId: other.pageId,
      actorId: 'synthetic',
      templateId: gameTemplate.key,
      path: '/other/',
    });
    await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId: game.pageId, title: 'NEVER_PUBLIC_DRAFT' });

    async function checkHome(releaseId: string, independent = false): Promise<void> {
      const result = await app!.get<IGetPublishedArtifact>(GET_PUBLISHED_ARTIFACT).execute({
        siteId, releaseId, path: 'index.html',
      });
      const chunks: Uint8Array[] = [];

      for await (const chunk of result!.content.bytes) {
        chunks.push(chunk);
      }
      const html = Buffer.concat(chunks).toString('utf8');

      expect(html).toContain('Public card teaser');
      expect(html).toContain('Public card alt');
      expect(html).toContain('/assets/images/card--w1440.webp');
      expect(html).toContain('srcset=');
      expect(html).not.toContain('NEVER_PUBLIC_DRAFT');

      if (independent) {
        for (const match of html.matchAll(/\/assets\/releases\/([^/]+)\//g)) {
          expect(match[1]).toBe(releaseId);
        }
      }

      const state = await app!.get<IPublicationStorePort>(PUBLICATION_STORE).read(siteId, releaseId);

      expect(state?.manifest?.publishedPages?.find((page) => page.pageId === game.pageId)?.tv)
        .toMatchObject({ teaser: 'Public card teaser', photo: { alt: 'Public card alt', missing: false } });
    }

    for (let cycle = 0; cycle < 2; cycle++) {
      const full = await rebuild.execute({
        siteId,
        actorId: 'synthetic',
        expectedActiveReleaseId: (await activation.getActive(siteId))!.releaseId,
      });

      await checkHome(full.releaseId, true);
      const single = await publish.execute({
        siteId,
        pageId: home.pageId,
        actorId: 'synthetic',
        templateId: homeTemplate.key,
        path: '/',
      });

      await checkHome(single.publication.releaseId);
      const unrelated = await publish.execute({
        siteId,
        pageId: other.pageId,
        actorId: 'synthetic',
        templateId: gameTemplate.key,
        path: '/other/',
      });

      await checkHome(unrelated.publication.releaseId);
      expect((await editorial.execute({ siteId, pageId: game.pageId })).pages[0]?.changedFields).toEqual(['title']);
    }
    await expect(editorial.execute({ siteId: 'foreign', pageId: game.pageId })).resolves.toMatchObject({ pages: [] });
  } finally {
    await app?.close();

    await cleanupDatabase();
    await connection.close();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
}, 60000);
