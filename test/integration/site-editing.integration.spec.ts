import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection, createConnection } from 'mongoose';
import { vi } from 'vitest';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  createRoutingModels, type IUrlRecord,
} from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { prepareBehavior } from '../../src/app/services/routing/url-behavior.service.js';
import { Url } from '../../src/domain/routing/url.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import type { IVersionedUrl } from '../../src/domain/routing/versioned-url.js';
import type { Site } from '../../src/domain/sites/site.js';
import { AppModule } from '../../src/infra/app.module.js';
import { CREATE_PAGE, GET_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { ARCHIVE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import {
  ASSIGN_INITIAL_PAGE_URL, REBIND_URL_TO_PAGE, URL_BEHAVIOR_STORE, URL_REPOSITORY,
} from '../../src/infra/routing/routing.tokens.js';
import { REDIRECT_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE, GET_SITE, UPDATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { ARCHIVE_SITE, RESOLVE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IArchivePage } from '../../src/ports/inbound/pages/archive-page.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { IRebindUrlToPage } from '../../src/ports/inbound/routing/rebind-url-to-page.port.js';
import type { IRedirectUrl } from '../../src/ports/inbound/routing/redirect-url.port.js';
import type { IArchiveSite } from '../../src/ports/inbound/sites/archive-site.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IGetSite } from '../../src/ports/inbound/sites/get-site.port.js';
import type { IResolveSite } from '../../src/ports/inbound/sites/resolve-site.port.js';
import type { IUpdateSite } from '../../src/ports/inbound/sites/update-site.port.js';
import type { IUrlRepository } from '../../src/ports/outbound/routing/url.repository.js';
import type { IUrlBehaviorStorePort } from '../../src/ports/outbound/routing/url-behavior-store.port.js';
import { pageInput } from '../support/pages.js';
import { siteInput } from '../support/sites.js';

interface IAddressFixture {
  site: Site;
  first: IVersionedUrl;
  second: IVersionedUrl;
  store: IUrlBehaviorStorePort;
}

describe('site editing through real composition and isolated MongoDB', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplicationContext;
  let sequence = 0;
  let fixtureRoot = '';

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB URI required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoCreate: false,
      autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    fixtureRoot = await mkdtemp(path.resolve('.tmp/site-editing-'));
    app = await NestFactory.createApplicationContext(AppModule.forLocalOperator({
      mongoUri,
      database,
      rendering: {
        sourcesRoot: path.join(fixtureRoot, 'sources'),
        artifactsRoot: path.join(fixtureRoot, 'artifacts'),
      },
      operator: { operatorId: 'operator', platformAdministrator: true },
    }), { logger: false, abortOnError: false });
  });
  afterAll(async () => {
    await app?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[0-9a-f]{32}$/.test(database)) {
          throw new Error('Unsafe cleanup');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (fixtureRoot) {
      if (!path.resolve(fixtureRoot).startsWith(path.resolve('.tmp') + path.sep)) {
        throw new Error('Unsafe fixture cleanup');
      }
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
  async function newSite(): Promise<Site> {
    const suffix = String(++sequence);

    return app.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(),
      mark: 'Site' + suffix,
      primaryDomain: 'site' + suffix + '.test',
    });
  }
  async function addresses(): Promise<IAddressFixture> {
    const site = await newSite();
    const urls: Url[] = [];

    for (const suffix of ['A', 'B']) {
      const mark = 'Route' + sequence + suffix;
      const page = await app.get<ICreatePage>(CREATE_PAGE).execute({ ...pageInput(), siteId: site.siteId, mark });

      urls.push(await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
        siteId: site.siteId,
        pageId: page.pageId,
        mark: mark + 'Address',
        path: '/' + suffix,
        segment: suffix,
        parentUrlId: null,
      }));
    }
    const store = app.get<IUrlBehaviorStorePort>(URL_BEHAVIOR_STORE);
    const first = await store.findVersionedUrl(site.siteId, urls[0]!.urlId);
    const second = await store.findVersionedUrl(site.siteId, urls[1]!.urlId);

    if (!first || !second) {
      throw new Error('Missing URLs');
    }

    return { site, first, second, store };
  }
  it('persists guarded display time zones without modifying pages or another site', async () => {
    const site = await newSite();
    const other = await newSite();
    const page = await app.get<ICreatePage>(CREATE_PAGE).execute({ ...pageInput(), siteId: site.siteId });
    const before = page.toState();
    const update = app.get<IUpdateSite>(UPDATE_SITE);

    await update.execute({ siteId: site.siteId, timeZone: 'Asia/Nicosia', expectedTimeZone: 'UTC' });
    const loaded = await app.get<IGetSite>(GET_SITE).execute({ siteId: site.siteId });

    expect(loaded?.timeZone).toBe('Asia/Nicosia');
    expect((await app.get<IGetSite>(GET_SITE).execute({ siteId: other.siteId }))?.timeZone).toBe('UTC');
    expect((await app.get<IGetPage>(GET_PAGE).execute({ siteId: site.siteId, pageId: page.pageId }))?.toState())
      .toEqual(before);
    await expect(update.execute({ siteId: site.siteId, timeZone: 'UTC', expectedTimeZone: 'UTC' }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    await verifyMigrations(connection, 'migrations');
  });
  it('protects languages of draft/archived pages and updates unused languages, default and domain', async () => {
    const site = await newSite();
    const update = app.get<IUpdateSite>(UPDATE_SITE);

    await app.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: site.siteId,
      mark: 'LanguagePage',
      language: 'ru',
    });
    await expect(update.execute({ siteId: site.siteId, removeLanguages: ['ru'] }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await connection.collection('pages').updateOne({ siteId: site.siteId }, { $set: { status: 'ARCHIVED' } });
    await expect(update.execute({ siteId: site.siteId, removeLanguages: ['ru'] }))
      .rejects.toMatchObject({ code: 'Conflict' });
    const changed = await update.execute({
      siteId: site.siteId,
      addLanguages: ['fr'],
      defaultLanguage: 'fr',
      removeLanguages: ['en'],
      primaryDomain: 'changed.test',
    });

    expect(changed.languages).toEqual(['ru', 'fr']);
    expect(changed.defaultLanguage).toBe('fr');
    expect(changed.primaryDomain).toBe('changed.test');
    await verifyMigrations(connection, 'migrations');
  });
  it('never removes a language concurrently with creating a page in that language', async () => {
    const site = await newSite();
    const outcomes = await Promise.allSettled([
      app.get<ICreatePage>(CREATE_PAGE).execute({
        ...pageInput(),
        siteId: site.siteId,
        mark: 'RacingPage',
        language: 'ru',
      }),
      app.get<IUpdateSite>(UPDATE_SITE).execute({ siteId: site.siteId, removeLanguages: ['ru'] }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const saved = await app.get<IGetSite>(GET_SITE).execute({ siteId: site.siteId });
    const count = await connection.collection('pages').countDocuments({ siteId: site.siteId, language: 'ru' });

    expect(count === 0 || saved?.languages.includes('ru')).toBe(true);
  });
  it('archives the site without losing content and retains administrative draft access', async () => {
    const site = await newSite();
    const archived = await app.get<IArchiveSite>(ARCHIVE_SITE).execute({ siteId: site.siteId });

    expect(archived.status).toBe('ARCHIVED');
    expect(await app.get<IResolveSite>(RESOLVE_SITE).execute({ hostname: site.primaryDomain })).toBeNull();
    const page = await app.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: site.siteId,
      mark: 'ArchivedSitePage',
    });

    expect((await app.get<IGetPage>(GET_PAGE).execute({ siteId: site.siteId, pageId: page.pageId }))?.pageId)
      .toBe(page.pageId);
    expect((await app.get<IArchiveSite>(ARCHIVE_SITE).execute({ siteId: site.siteId })).status).toBe('ARCHIVED');
  });
  it('archives only the page state and preserves its content and publication metadata', async () => {
    const site = await newSite();
    const page = await app.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: site.siteId,
      mark: 'ArchiveContentPage',
      contentMd: 'Retained content',
    });
    const archived = await app.get<IArchivePage>(ARCHIVE_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });

    expect(archived.toState()).toMatchObject({
      status: 'ARCHIVED',
      contentMd: 'Retained content',
      pageId: page.pageId,
      language: page.language,
      publishedAt: page.publishedAt,
    });
    expect(await connection.collection<{ _id: string }>('pages')
      .countDocuments({ siteId: site.siteId, _id: page.pageId })).toBe(1);
  });
  it('rebinds a retained address with history and rejects occupied or stale targets', async () => {
    const site = await newSite();
    const page = await app.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: site.siteId,
      mark: 'OldBindingPage',
    });
    const replacement = await app.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: site.siteId,
      mark: 'NewBindingPage',
    });
    const url = await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId: site.siteId,
      pageId: page.pageId,
      mark: 'RetainedAddress',
      path: '/retained',
      segment: 'retained',
      parentUrlId: null,
    });
    const store = app.get<IUrlBehaviorStorePort>(URL_BEHAVIOR_STORE);

    await connection.collection<IUrlRecord>('urls')
      .updateOne({ _id: url.urlId, siteId: site.siteId }, { $unset: { version: 1 } });
    const current = await store.findVersionedUrl(site.siteId, url.urlId);

    if (!current) {
      throw new Error('Missing URL');
    }
    expect(current.version).toMatch(/^legacy:/);

    const input = {
      siteId: site.siteId,
      actorId: 'operator',
      urlId: url.urlId,
      expectedVersion: current.version,
      replacementPageId: replacement.pageId,
    };
    const changed = await app.get<IRebindUrlToPage>(REBIND_URL_TO_PAGE).execute(input);

    expect(changed.toState()).toMatchObject({
      ...url.toState(),
      pageId: replacement.pageId,
      updatedAt: expect.any(Date),
    });
    expect((await app.get<IUrlRepository>(URL_REPOSITORY).getHistory(url.urlId))[0]?.pageId).toBe(page.pageId);
    await expect(app.get<IRebindUrlToPage>(REBIND_URL_TO_PAGE).execute(input)).rejects.toThrow();
    expect((await store.findVersionedUrl(site.siteId, url.urlId))?.version).not.toBe(current.version);
  });
  it('retains redirect history and rejects cycles from concurrent opposite commands', async () => {
    const f = await addresses();

    await expect(app.get<IRebindUrlToPage>(REBIND_URL_TO_PAGE).execute({
      siteId: f.site.siteId,
      actorId: 'operator',
      urlId: f.first.url.urlId,
      expectedVersion: f.first.version,
      replacementPageId: f.second.url.pageId!,
    })).rejects.toThrow();
    const operation = app.get<IRedirectUrl>(REDIRECT_URL);
    const results = await Promise.allSettled([
      operation.execute({
        siteId: f.site.siteId,
        actorId: 'operator',
        urlId: f.first.url.urlId,
        expectedVersion: f.first.version,
        targetUrlId: f.second.url.urlId,
        redirectStatus: UrlRedirectStatus.HTTP_301,
      }),
      operation.execute({
        siteId: f.site.siteId,
        actorId: 'operator',
        urlId: f.second.url.urlId,
        expectedVersion: f.second.version,
        targetUrlId: f.first.url.urlId,
        redirectStatus: UrlRedirectStatus.HTTP_308,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await connection.collection('url_history').countDocuments({ siteId: f.site.siteId })).toBe(1);
    const rows = await connection.collection('urls').find({ siteId: f.site.siteId }).toArray();

    expect(rows.filter((row) => row.kind === 'REDIRECT')).toHaveLength(1);
    expect(rows.filter((row) => row.kind === 'PAGE')).toHaveLength(1);
    await verifyMigrations(connection, 'migrations');
  });
  it('guards changed redirect targets and rolls back history if the final URL write fails', async () => {
    const f = await addresses();
    const a = new Url(f.first.url);

    a.redirectTo(f.second.url.urlId, UrlRedirectStatus.HTTP_301);
    const b = new Url(f.second.url);

    b.redirectTo(f.first.url.urlId, UrlRedirectStatus.HTTP_301);
    const values = { nextHistoryId: randomUUID, nextVersion: randomUUID, currentInstant: () => new Date() };
    const firstChange = prepareBehavior(f.first, a, values);
    const secondChange = prepareBehavior(f.second, b, values);

    await f.store.commitBehaviorChange(firstChange);
    await expect(f.store.commitBehaviorChange(secondChange)).rejects.toThrow();
    const current = await f.store.findVersionedUrl(f.site.siteId, f.second.url.urlId);

    if (!current) {
      throw new Error('Missing URL');
    }

    const noCycle = prepareBehavior(current, new Url(current.url), values);
    const models = createRoutingModels(app.get<Connection>(MONGO_CONNECTION));
    const fail = vi.spyOn(models.urls, 'updateOne').mockImplementationOnce(() => {
      throw new Error('Synthetic write failure');
    });

    try {
      await expect(f.store.commitBehaviorChange(noCycle)).rejects.toThrow('Synthetic write failure');
    } finally {
      fail.mockRestore();
    }
    expect(await connection.collection('url_history').countDocuments({ siteId: f.site.siteId })).toBe(1);
    expect((await f.store.findVersionedUrl(f.site.siteId, f.second.url.urlId))?.version).toBe(current.version);
  });
});
