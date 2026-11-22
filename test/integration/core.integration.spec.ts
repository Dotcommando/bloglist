import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection, createConnection } from 'mongoose';

import {
  applyMigrations, readMigrations, verifyMigrations,
} from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { Page } from '../../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PageScopeError } from '../../src/domain/pages/page-scope.error.js';
import { Site } from '../../src/domain/sites/site.js';
import { SiteStatus } from '../../src/domain/sites/site-status.enum.js';
import { AppModule } from '../../src/infra/app.module.js';
import { CREATE_PAGE, GET_PAGE, MOVE_PAGE, PAGE_REPOSITORY } from '../../src/infra/pages/pages.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE, GET_SITE, RESOLVE_SITE, SITE_REPOSITORY } from '../../src/infra/sites/sites.tokens.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IMovePage } from '../../src/ports/inbound/pages/move-page.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IGetSite } from '../../src/ports/inbound/sites/get-site.port.js';
import type { IResolveSite } from '../../src/ports/inbound/sites/resolve-site.port.js';
import type { IPageRepository } from '../../src/ports/outbound/pages/page.repository.js';
import type { ISiteRepository } from '../../src/ports/outbound/sites/site.repository.js';
import { pageInput } from '../support/pages.js';
import { siteInput } from '../support/sites.js';

describe('local application with isolated MongoDB', () => {
  const database = `zarya_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Connection;
  let application: INestApplicationContext;
  let mongoUri = '';
  let fixtureRoot = '';

  beforeAll(async () => {
    const selectedUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!selectedUri) {
      throw new Error('Set ZARYA_TEST_MONGO_URI explicitly; integration tests never choose a database server');
    }
    mongoUri = selectedUri;
    connection = await createConnection(mongoUri, {
      dbName: database,
      maxPoolSize: 3,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    fixtureRoot = await mkdtemp(path.resolve('.tmp/core-'));
    application = await NestFactory.createApplicationContext(AppModule.forLocalOperator({
      mongoUri,
      database,
      rendering: {
        sourcesRoot: path.join(fixtureRoot, 'sources'),
        artifactsRoot: path.join(fixtureRoot, 'artifacts'),
      },
      operator: { operatorId: 'integration-operator', platformAdministrator: true },
    }),
    { logger: false, abortOnError: false });
  });

  afterAll(async () => {
    await application?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[0-9a-f]{32}$/.test(database)) {
          throw new Error('Refusing to remove a database outside this test run');
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

  it('creates a durable site and rejects case-insensitive duplicates', async () => {
    const create = application.get<ICreateSite>(CREATE_SITE);
    const site = await create.execute(siteInput());

    expect(site.primaryDomain).toBe('example.test');
    expect((await application.get<IGetSite>(GET_SITE).execute({ siteId: site.siteId }))?.toState())
      .toEqual(site.toState());
    expect(await application.get<IGetSite>(GET_SITE).execute({ siteId: 'missing' })).toBeNull();
    const resolve = application.get<IResolveSite>(RESOLVE_SITE);

    expect((await resolve.execute({ hostname: ' EXAMPLE.TEST ' }))?.siteId).toBe(site.siteId);
    expect(await resolve.execute({ hostname: 'unknown.test' })).toBeNull();
    const createPage = application.get<ICreatePage>(CREATE_PAGE);
    const page = await createPage.execute({ ...pageInput(), siteId: site.siteId });

    expect(page.siteId).toBe(site.siteId);
    expect(page.publishedAt).toBeNull();
    const getPage = application.get<IGetPage>(GET_PAGE);

    expect((await getPage.execute({ siteId: site.siteId, pageId: page.pageId }))?.toState()).toEqual(page.toState());
    expect(await getPage.execute({ siteId: site.siteId, pageId: 'missing' })).toBeNull();
    await expect(getPage.execute({ siteId: 'other-site', pageId: page.pageId })).rejects.toThrow();
    await expect(createPage.execute({ ...pageInput(), mark: 'GermanHome', siteId: site.siteId, language: 'de' }))
      .rejects.toThrow();
    await expect(create.execute({ ...siteInput(), mark: 'eXAMPLE', primaryDomain: 'other.test' }))
      .rejects.toMatchObject({ code: 'Conflict' });
  });

  it('reads persisted entities after closing and recreating an application context', async () => {
    const site = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(),
      mark: 'Durable',
      primaryDomain: 'durable.test',
    });
    const page = await application.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      mark: 'DurableHome',
      siteId: site.siteId,
    });
    const restarted = await NestFactory.createApplicationContext(AppModule.forLocalOperator({
      mongoUri,
      database,
      rendering: {
        sourcesRoot: path.join(fixtureRoot, 'sources'),
        artifactsRoot: path.join(fixtureRoot, 'artifacts'),
      },
      operator: { operatorId: 'second-operator', platformAdministrator: true },
    }),
    { logger: false, abortOnError: false });

    try {
      const reloadedSite = await restarted.get<IGetSite>(GET_SITE).execute({ siteId: site.siteId });

      expect(reloadedSite?.toState()).toEqual(site.toState());
      expect((await restarted.get<IGetPage>(GET_PAGE).execute({ siteId: site.siteId, pageId: page.pageId }))?.toState())
        .toEqual(page.toState());
    } finally {
      await restarted.close();
    }
  });

  it('hides archived domain mappings while retaining administrative draft creation/read', async () => {
    const site = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(),
      mark: 'Archived',
      primaryDomain: 'archived.test',
    });

    site.archive();
    await application.get<ISiteRepository>(SITE_REPOSITORY).save(site);
    expect(await application.get<IResolveSite>(RESOLVE_SITE).execute({ hostname: 'archived.test' })).toBeNull();
    const archived = await application.get<IGetSite>(GET_SITE).execute({ siteId: site.siteId });

    expect(archived?.status).toBe(SiteStatus.ARCHIVED);
    const page = await application.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      mark: 'ArchivedHome',
      siteId: site.siteId,
    });

    expect(page.publishedAt).toBeNull();
    expect((await application.get<IGetPage>(GET_PAGE).execute({ siteId: site.siteId, pageId: page.pageId }))?.pageId)
      .toBe(page.pageId);
  });

  it('enforces unique site domains and case-insensitive marks during concurrent adapter writes', async () => {
    const repository = application.get<ISiteRepository>(SITE_REPOSITORY);
    const instant = new Date();
    const makeSite = (mark: string, host: string): Site => new Site({
      ...siteInput(),
      siteId: randomUUID(),
      mark,
      primaryDomain: host,
      status: SiteStatus.ACTIVE,
      createdAt: instant,
      updatedAt: instant,
    });
    const marks = await Promise.allSettled([
      repository.save(makeSite('RaceMark', 'race-one.test')),
      repository.save(makeSite('rACEmARK', 'race-two.test')),
    ]);

    expect(marks.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(marks.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const domains = await Promise.allSettled([
      repository.save(makeSite('DomainOne', 'domain-race.test')),
      repository.save(makeSite('DomainTwo', 'domain-race.test')),
    ]);

    expect(domains.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(domains.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await repository.findByMark('racemark'))?.mark.toLowerCase()).toBe('racemark');
    expect(await repository.findByPrimaryDomain('domain-race.test')).not.toBeNull();
    expect((await repository.findAll()).length).toBeGreaterThan(1);
  });

  it('allows page marks in different sites and rejects cross-site reads while keeping lists scoped', async () => {
    const createSite = application.get<ICreateSite>(CREATE_SITE);
    const first = await createSite.execute({ ...siteInput(), mark: 'FirstTenant', primaryDomain: 'first.test' });
    const second = await createSite.execute({ ...siteInput(), mark: 'SecondTenant', primaryDomain: 'second.test' });
    const create = application.get<ICreatePage>(CREATE_PAGE);
    const races = await Promise.allSettled([
      create.execute({ ...pageInput(), siteId: first.siteId, mark: 'SharedMark' }),
      create.execute({ ...pageInput(), siteId: second.siteId, mark: 'sHAREDmARK' }),
    ]);

    expect(races.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(races.filter((result) => result.status === 'rejected')).toHaveLength(0);
    const own = await create.execute({ ...pageInput(), siteId: first.siteId, mark: 'FirstHome' });
    const foreign = await create.execute({ ...pageInput(), siteId: second.siteId, mark: 'SecondHome' });

    await expect(application.get<IGetPage>(GET_PAGE).execute({ siteId: first.siteId, pageId: foreign.pageId }))
      .rejects.toBeInstanceOf(PageScopeError);
    const repository = application.get<IPageRepository>(PAGE_REPOSITORY);
    const listed = await repository.findBySite(first.siteId, { clusterId: null, language: 'en' });

    expect(listed.some((page) => page.pageId === own.pageId)).toBe(true);
    expect(listed.every((page) => page.siteId === first.siteId)).toBe(true);
    expect(await repository.findByCluster('missing-cluster')).toEqual([]);
  });

  it('round-trips rendering, empty parameters and update fields through the full page adapter', async () => {
    const site = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(),
      mark: 'Mapping',
      primaryDomain: 'mapping.test',
    });
    const page = await application.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: site.siteId,
      mark: 'MappingHome',
    });

    page.configureRendering({
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: {},
      loaders: [{
        loaderId: 'ReadContent',
        alias: 'content',
        phase: LoaderPhase.Build,
        parameters: {},
        dependsOn: [],
        required: true,
      }],
    });
    page.changeTitle('Updated title');
    const repository = application.get<IPageRepository>(PAGE_REPOSITORY);
    const saved = await repository.save(page);

    expect(saved.toState().rendering).toEqual(page.toState().rendering);
    expect((await repository.findById(page.pageId))?.title).toBe('Updated title');
    const { rendering, ...withoutRendering } = saved.toState();

    expect(rendering).toBeDefined();
    expect((await repository.save(new Page(withoutRendering))).toState()).not.toHaveProperty('rendering');
  });

  it('allocates immutable page numbers, sibling orders and preserves content on moving', async () => {
    const site = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'Tree', primaryDomain: 'tree.test',
    });
    const create = application.get<ICreatePage>(CREATE_PAGE);
    const make = (mark: string, parentPageId: string | null = null, sortOrder?: number): Promise<Page> =>
      create.execute({
        ...pageInput(), siteId: site.siteId, mark, parentPageId, ...(sortOrder === undefined ? {} : { sortOrder }),
      });
    const root = await make('TreeRoot');
    const folder = await make('TreeFolder');
    const child = await make('TreeChild', folder.pageId);
    const child2 = await make('TreeChildTwo', folder.pageId);

    expect([root.pageNumber, folder.pageNumber, child.pageNumber, child2.pageNumber]).toEqual(['4', '5', '6', '7']);
    expect([root.sortOrder, folder.sortOrder, child.sortOrder, child2.sortOrder]).toEqual([400, 500, 100, 200]);
    const assign = application.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL);
    const address = await assign.execute({
      siteId: site.siteId,
      pageId: child.pageId,
      mark: 'ChildAddress',
      parentUrlId: null,
      segment: 'child',
      path: '/child',
    });
    const beforeUrls = await connection.db!.collection('urls').find({ siteId: site.siteId }).toArray();
    const beforeHistory = await connection.db!.collection('url_history').find({ siteId: site.siteId }).toArray();
    const move = application.get<IMovePage>(MOVE_PAGE);
    const moved = await move.execute({
      siteId: site.siteId,
      pageId: child.pageId,
      parentPageId: null,
      expectedParentPageId: folder.pageId,
      expectedSortOrder: 100,
    });

    expect(moved.toState()).toEqual({ ...child.toState(), parentPageId: null, updatedAt: moved.updatedAt });
    expect((await application.get<IGetPage>(GET_PAGE).execute({ siteId: site.siteId, pageId: child.pageId }))
      ?.parentPageId).toBeNull();
    await expect(move.execute({
      siteId: site.siteId,
      pageId: child.pageId,
      parentPageId: folder.pageId,
      expectedParentPageId: folder.pageId,
      expectedSortOrder: 100,
    })).rejects.toMatchObject({ code: 'Conflict' });
    await expect(move.execute({
      siteId: site.siteId,
      pageId: folder.pageId,
      parentPageId: child2.pageId,
      expectedParentPageId: null,
      expectedSortOrder: 500,
    })).rejects.toMatchObject({ code: 'Validation' });
    expect(await connection.db!.collection('urls').find({ siteId: site.siteId }).toArray()).toEqual(beforeUrls);
    expect(await connection.db!.collection('url_history').find({ siteId: site.siteId }).toArray())
      .toEqual(beforeHistory);
    expect(address.path).toBe('/child');
    const manual = await make('TreeManual', folder.pageId, 55);

    expect(manual.sortOrder).toBe(55);
    expect(manual.pageNumber).toBe('8');
    await expect(make('TreeForeignParent', 'missing')).rejects.toMatchObject({ code: 'NotFound' });
    const repository = application.get<IPageRepository>(PAGE_REPOSITORY);

    await expect(repository.save(new Page({ ...root.toState(), pageNumber: '999' }))).rejects.toThrow();
    const racing = await Promise.allSettled([make('TreeRaceOne'), make('TreeRaceTwo')]);
    const numbers = racing.flatMap((result) => result.status === 'fulfilled' ? [result.value.pageNumber] : []);

    expect(numbers.length).toBeGreaterThan(0);
    expect(new Set(numbers).size).toBe(numbers.length);

    for (const result of racing) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ name: 'PageConflictError' });
      }
    }
  });

  it('verifies BSON validators and reproducible migrations, rejecting modified receipts', async () => {
    const db = connection.db;

    if (!db) {
      throw new Error('Expected the isolated database');
    }
    await expect(db.collection('sites').insertOne({ name: 'Invalid shape' })).rejects.toMatchObject({ code: 121 });
    await expect(db.collection('pages').insertOne({ siteId: 'not-a-page' })).rejects.toMatchObject({ code: 121 });
    const migrations = await readMigrations('migrations');

    await applyMigrations(connection, 'migrations');
    const receipts = db.collection<{ _id: string; checksum: string }>('schema_migrations');

    expect(await receipts.countDocuments()).toBe(migrations.length);
    const migration = migrations[0];

    if (!migration) {
      throw new Error('Missing initial migration');
    }
    await receipts.updateOne({ _id: migration.id }, { $set: { checksum: '0'.repeat(64) } });

    try {
      await expect(verifyMigrations(connection, 'migrations')).rejects.toThrow('modified migration');
      await expect(applyMigrations(connection, 'migrations')).rejects.toThrow('checksum differs');
    } finally {
      await receipts.updateOne({ _id: migration.id }, { $set: { checksum: migration.checksum } });
    }
    await verifyMigrations(connection, 'migrations');
  });

  it('rejects application startup with a missing unique index without silently recreating it', async () => {
    const collection = connection.collection('sites');

    await collection.dropIndex('sites_domain_unique');

    try {
      await expect(NestFactory.createApplicationContext(AppModule.forLocalOperator({
        mongoUri,
        database,
        rendering: {
          sourcesRoot: path.join(fixtureRoot, 'sources'),
          artifactsRoot: path.join(fixtureRoot, 'artifacts'),
        },
        operator: { operatorId: 'verification-operator', platformAdministrator: true },
      }),
      { logger: false, abortOnError: false })).rejects.toThrow('Missing or incompatible index');
      expect((await collection.indexes()).some((index) => index.name === 'sites_domain_unique')).toBe(false);
    } finally {
      await collection.createIndex({ primaryDomain: 1 }, { name: 'sites_domain_unique', unique: true });
    }
    await verifyMigrations(connection, 'migrations');
  });
});
