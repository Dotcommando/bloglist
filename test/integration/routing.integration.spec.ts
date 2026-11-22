import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { vi } from 'vitest';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  createRoutingModels, type IUrlHistoryRecord,
} from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseUrlRepository, toUrl,
} from '../../src/adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { OldUrlAction } from '../../src/domain/routing/old-url-action.enum.js';
import { RoutingConflictError } from '../../src/domain/routing/routing-conflict.error.js';
import { Url } from '../../src/domain/routing/url.js';
import { planUrlGraphChange } from '../../src/domain/routing/url-graph-change.policy.js';
import { UrlKind } from '../../src/domain/routing/url-kind.enum.js';
import { ChildrenUrlAction, IncomingRedirectAction } from '../../src/domain/routing/url-move-options.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE, GET_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import {
  ASSIGN_INITIAL_PAGE_URL, CHANGE_PAGE_URL, FIND_URL_BY_PATH, GET_URL_HISTORY, URL_REPOSITORY,
} from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../../src/ports/inbound/routing/change-page-url.port.js';
import type { IFindUrlByPath } from '../../src/ports/inbound/routing/find-url-by-path.port.js';
import type { IGetUrlHistory } from '../../src/ports/inbound/routing/get-url-history.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IChangePageUrlPersistence, IUrlRepository } from '../../src/ports/outbound/routing/url.repository.js';
import { pageInput } from '../support/pages.js';
import { siteInput } from '../support/sites.js';

describe('working routing with isolated transactional MongoDB', () => {
  const database = `zarya_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Connection;
  let application: INestApplicationContext;
  let directory: string | undefined;
  let sequence = 0;

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit ZARYA_TEST_MONGO_URI is required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoCreate: false,
      autoIndex: false,
      maxPoolSize: 3,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    directory = await mkdtemp(path.join(os.tmpdir(), 'zarya-routing-'));
    const sourcesRoot = path.join(directory, 'sources');
    const artifactsRoot = path.join(directory, 'artifacts');

    await Promise.all([mkdir(sourcesRoot), mkdir(artifactsRoot)]);
    application = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'routing-test', platformAdministrator: true },
      rendering: { sourcesRoot, artifactsRoot },
      backgroundWork: false,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await application?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Refusing unsafe integration cleanup');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (directory) {
      if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith('zarya-routing-')) {
        throw new Error('Refusing unsafe fixture cleanup');
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  async function fixture(): Promise<{ root: Url; child: Url; grand: Url; repository: IUrlRepository }> {
    const suffix = String(++sequence);
    const site = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(),
      mark: `RoutingSite${suffix}`,
      primaryDomain: `routing${suffix}.test`,
    });
    const createPage = application.get<ICreatePage>(CREATE_PAGE);
    const assign = application.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL);
    const rootPage = await createPage.execute({ ...pageInput(), siteId: site.siteId, mark: `RootPage${suffix}` });
    const childPage = await createPage.execute({ ...pageInput(), siteId: site.siteId, mark: `ChildPage${suffix}` });
    const grandPage = await createPage.execute({ ...pageInput(), siteId: site.siteId, mark: `GrandPage${suffix}` });
    const root = await assign.execute({
      siteId: site.siteId,
      pageId: rootPage.pageId,
      mark: `RootUrl${suffix}`,
      parentUrlId: null,
      path: '/games/old/',
      segment: 'old',
    });
    const child = await assign.execute({
      siteId: site.siteId,
      pageId: childPage.pageId,
      mark: `ChildUrl${suffix}`,
      parentUrlId: root.urlId,
      path: '/games/old/report/',
      segment: 'report',
    });
    const grand = await assign.execute({
      siteId: site.siteId,
      pageId: grandPage.pageId,
      mark: `GrandUrl${suffix}`,
      parentUrlId: child.urlId,
      path: '/games/old/report/photos/',
      segment: 'photos',
    });

    return { root, child, grand, repository: application.get<IUrlRepository>(URL_REPOSITORY) };
  }

  function moveInput(root: Url): { siteId: string;
    pageId: string;
    mark: string;
    path: string;
    parentUrlId: null;
    segment: string;
    redirectStatus: UrlRedirectStatus } {
    if (root.pageId === null) {
      throw new Error('Expected PAGE fixture');
    }

    return {
      siteId: root.siteId,
      pageId: root.pageId,
      mark: `Move${randomUUID().replaceAll('-', '')}`,
      path: '/games/new/',
      parentUrlId: null,
      segment: 'new',
      redirectStatus: UrlRedirectStatus.HTTP_308,
    };
  }

  it.each([ChildrenUrlAction.Keep, ChildrenUrlAction.PromoteWithRedirect,
    ChildrenUrlAction.PromoteWithoutRedirect])('handles nested URL deletion: %s', async (childrenAction) => {
    const { root, child, grand, repository } = await fixture();
    const alias = new Url({
      ...root.toState(),
      urlId: randomUUID(),
      mark: 'Alias' + (++sequence),
      kind: UrlKind.REDIRECT,
      pageId: null,
      redirectTargetUrlId: root.urlId,
      redirectStatus: 301,
      path: '/alias/',
    });

    await repository.save(alias);
    const result = await application.get<IChangePageUrl>(CHANGE_PAGE_URL).execute({
      ...moveInput(root),
      oldUrlAction: OldUrlAction.Delete,
      childrenAction,
      incomingRedirectAction: IncomingRedirectAction.Delete,
    });

    expect(await repository.findById(root.urlId)).toBeNull();
    expect(await repository.findById(alias.urlId)).toBeNull();
    expect(await connection.db!.collection('url_history').countDocuments({
      siteId: root.siteId,
      urlId: { $in: [root.urlId, alias.urlId] },
    })).toBe(0);

    if (childrenAction === ChildrenUrlAction.Keep) {
      expect((await repository.findById(child.urlId))?.toState()).toMatchObject({
        path: child.path,
        parentUrlId: result.urlId,
      });
      expect((await repository.findById(grand.urlId))?.path).toBe(grand.path);
    } else {
      const moved = await repository.findByPath(root.siteId, '/games/report/');
      const movedGrand = await repository.findByPath(root.siteId, '/games/report/photos/');

      expect(moved?.pageId).toBe(child.pageId);
      expect(moved?.parentUrlId).toBeNull();
      expect(movedGrand?.parentUrlId).toBe(moved?.urlId);
      expect((await repository.findById(child.urlId))?.kind ?? null)
        .toBe(childrenAction === ChildrenUrlAction.PromoteWithRedirect ? UrlKind.REDIRECT : null);
    }
  });

  it('rolls back permanent deletion and history purging if replacement insertion fails', async () => {
    const { root, child, repository } = await fixture();
    const models = createRoutingModels(connection);
    const failure = new Error('Synthetic replacement failure');
    const replacement = new Url({
      ...root.toState(),
      urlId: randomUUID(),
      mark: 'Rollback' + sequence,
      path:
      '/replacement/',
    });
    const originals = (await models.urls.find({ siteId: root.siteId }).lean().exec()).map((record) =>
      toUrl(record).toState());
    const graphChange = planUrlGraphChange(root, replacement, originals, new Map(), {
      oldUrlAction: OldUrlAction.Delete,
      childrenAction: ChildrenUrlAction.Keep,
      incomingRedirectAction: IncomingRedirectAction.Retarget,
      redirectStatus: 301,
    });

    await connection.db!.collection<IUrlHistoryRecord>('url_history').insertOne({
      _id: randomUUID(),
      siteId: root.siteId,
      urlId: root.urlId,
      kind: UrlKind.PAGE,
      pageId: root.pageId,
      redirectTargetUrlId: null,
      redirectStatus: null,
      createdAt: root.createdAt,
    });

    vi.spyOn(models.urls, 'insertOne').mockRejectedValueOnce(failure);
    await expect(new MongooseUrlRepository(models, () => new Date(), randomUUID).changePageUrl({
      previousUrl: root.toState(),
      newUrl: replacement,
      graphChange,
      oldUrlAction: OldUrlAction.Delete,
      redirectStatus: 301,
      changedAt: replacement.updatedAt,
    })).rejects.toThrow('Synthetic replacement failure');
    expect((await repository.findById(root.urlId))?.toState()).toEqual(root.toState());
    expect((await repository.findById(child.urlId))?.toState()).toEqual(child.toState());
    expect(await connection.db!.collection('url_history').countDocuments({
      siteId: root.siteId,
      urlId:
      root.urlId,
    })).toBe(1);
  });

  it('persists partial page edits and completes the default assign/find/move/history cycle', async () => {
    const { root, child, repository } = await fixture();
    const input = moveInput(root);
    const updated = await application.get<IUpdatePage>(UPDATE_PAGE).execute({
      siteId: root.siteId,
      pageId: input.pageId,
      title: 'Updated',
      metaDescription: null,
      robotsIndex: false,
    });
    const persisted = await application.get<IGetPage>(GET_PAGE).execute({ siteId: root.siteId, pageId: input.pageId });

    expect(persisted?.toState()).toEqual(updated.toState());
    expect(updated.publishedAt).toBeNull();
    const moved = await application.get<IChangePageUrl>(CHANGE_PAGE_URL).execute(input);
    const find = application.get<IFindUrlByPath>(FIND_URL_BY_PATH);

    expect((await find.execute({ siteId: root.siteId, path: '/games/new/' }))?.urlId).toBe(moved.urlId);
    expect((await find.execute({ siteId: root.siteId, path: root.path }))?.toState()).toMatchObject({
      urlId: root.urlId, mark: root.mark, kind: UrlKind.REDIRECT, redirectTargetUrlId: moved.urlId, redirectStatus: 308,
    });
    expect((await repository.findById(child.urlId))?.toState()).toEqual(child.toState());
    const history = await application.get<IGetUrlHistory>(GET_URL_HISTORY)
      .execute({ siteId: root.siteId, urlId: root.urlId });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: UrlKind.PAGE, pageId: input.pageId, redirectTargetUrlId: null });
    expect(await repository.getHistory(moved.urlId)).toEqual([]);
    expect(await find.execute({ siteId: root.siteId, path: '/games/new' })).toBeNull();
  });

  it('atomically relocates all descendants and remaps internal redirect targets', async () => {
    const { root, child, grand, repository } = await fixture();
    const at = new Date();
    const alias = new Url({
      ...child.toState(),
      urlId: randomUUID(),
      mark: `Alias${sequence}`,
      path: '/games/old/alias/',
      segment: 'alias',
      parentUrlId: root.urlId,
      kind: UrlKind.REDIRECT,
      pageId: null,
      redirectTargetUrlId: grand.urlId,
      redirectStatus: UrlRedirectStatus.HTTP_301,
      createdAt: at,
      updatedAt: at,
      firstPublishedAt: at,
    });

    await repository.save(alias);
    const moved = await application.get<IChangePageUrl>(CHANGE_PAGE_URL)
      .execute({ ...moveInput(root), moveSubtree: true });
    const nextChild = await repository.findByPath(root.siteId, '/games/new/report/');
    const nextGrand = await repository.findByPath(root.siteId, '/games/new/report/photos/');
    const nextAlias = await repository.findByPath(root.siteId, '/games/new/alias/');

    expect(nextChild?.parentUrlId).toBe(moved.urlId);
    expect(nextGrand?.parentUrlId).toBe(nextChild?.urlId);
    expect(nextAlias?.redirectTargetUrlId).toBe(nextGrand?.urlId);
    expect(nextAlias?.redirectStatus).toBe(301);

    for (const previous of [root, child, grand, alias]) {
      expect((await repository.findById(previous.urlId))?.kind).toBe(UrlKind.REDIRECT);
      expect(await repository.getHistory(previous.urlId)).toHaveLength(1);
    }
    const current = await repository.findCurrentByPage(moveInput(root).pageId);

    expect(current?.urlId).toBe(moved.urlId);
  });

  it('rolls back all history/redirect/insertion writes after an injected mid-transaction failure', async () => {
    const { root, child, grand, repository } = await fixture();
    const models = createRoutingModels(connection);
    const original = models.urls.insertOne.bind(models.urls);
    let insertions = 0;
    const fault = new Error('Synthetic failure after the first replacement insert');
    const insert = vi.spyOn(models.urls, 'insertOne').mockImplementation(async (...args) => {
      if (++insertions === 2) {
        throw fault;
      }

      return original(...args);
    });
    const commit = vi.spyOn(repository, 'changePageUrl').mockImplementation(async (change) => {
      await new MongooseUrlRepository(models, () => new Date(), randomUUID).changePageUrl(change);
    });

    await expect(application.get<IChangePageUrl>(CHANGE_PAGE_URL)
      .execute({ ...moveInput(root), moveSubtree: true })).rejects.toBe(fault);
    expect(commit).toHaveBeenCalledOnce();
    insert.mockRestore();

    for (const previous of [root, child, grand]) {
      expect((await repository.findById(previous.urlId))?.toState()).toEqual(previous.toState());
      expect(await repository.getHistory(previous.urlId)).toEqual([]);
    }
    expect(await repository.findByPath(root.siteId, '/games/new/')).toBeNull();
    expect(await repository.findByPath(root.siteId, '/games/new/report/')).toBeNull();
  });

  it('rejects stale captured subtrees after concurrent membership changes', async () => {
    const { root, repository } = await fixture();
    const extra = await application.get<ICreatePage>(CREATE_PAGE).execute({
      ...pageInput(),
      siteId: root.siteId,
      mark: `ExtraPage${sequence}`,
    });
    const actual = repository.changePageUrl.bind(repository);

    vi.spyOn(repository, 'changePageUrl').mockImplementationOnce(async (change) => {
      await application.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
        siteId: root.siteId,
        pageId: extra.pageId,
        mark: `ExtraUrl${sequence}`,
        path: '/games/old/extra/',
        segment: 'extra',
        parentUrlId: root.urlId,
      });
      await actual(change);
    });
    await expect(application.get<IChangePageUrl>(CHANGE_PAGE_URL)
      .execute({ ...moveInput(root), moveSubtree: true })).rejects.toBeInstanceOf(RoutingConflictError);
    expect((await repository.findById(root.urlId))?.kind).toBe(UrlKind.PAGE);
    expect(await repository.getHistory(root.urlId)).toEqual([]);
  });

  it('preserves an actually committed move after a lost commit acknowledgement without retry', async () => {
    const { root, repository } = await fixture();
    const applicationConnection = application.get<Connection>(MONGO_CONNECTION);
    const startSession = applicationConnection.startSession.bind(applicationConnection);
    const lost = Object.assign(new Error('Synthetic lost commit acknowledgement'), { code: 112 });
    let commits = 0;

    vi.spyOn(applicationConnection, 'startSession').mockImplementation(async (...args) => {
      const session = await startSession(...args);
      const commit = session.commitTransaction.bind(session);

      vi.spyOn(session, 'commitTransaction').mockImplementation(async () => {
        commits++;
        await commit();
        throw lost;
      });

      return session;
    });
    await expect(application.get<IChangePageUrl>(CHANGE_PAGE_URL).execute(moveInput(root))).rejects.toBe(lost);
    expect(commits).toBe(1);
    const current = await repository.findByPath(root.siteId, '/games/new/');

    expect(current?.kind).toBe(UrlKind.PAGE);
    expect((await repository.findById(root.urlId))?.redirectTargetUrlId).toBe(current?.urlId);
    expect(await repository.getHistory(root.urlId)).toHaveLength(1);
  });

  it('rejects stale old state and destination conflicts without orphan history', async () => {
    const { root, child, repository } = await fixture();
    const actual = repository.changePageUrl.bind(repository);

    vi.spyOn(repository, 'changePageUrl').mockImplementationOnce(async (change) => {
      const stale: IChangePageUrlPersistence = {
        ...change,
        previousUrl: { ...change.previousUrl, updatedAt: new Date(0) },
      };

      await actual(stale);
    });
    const operation = application.get<IChangePageUrl>(CHANGE_PAGE_URL);

    await expect(operation.execute(moveInput(root))).rejects.toBeInstanceOf(RoutingConflictError);
    await expect(operation.execute({ ...moveInput(root), path: child.path }))
      .rejects.toBeInstanceOf(RoutingConflictError);
    expect(await repository.getHistory(root.urlId)).toEqual([]);
    expect((await repository.findById(root.urlId))?.kind).toBe(UrlKind.PAGE);
  });

  it('preserves site isolation with matching paths and rejects foreign history reads', async () => {
    const first = await fixture();
    const second = await fixture();
    const find = application.get<IFindUrlByPath>(FIND_URL_BY_PATH);

    expect((await find.execute({ siteId: first.root.siteId, path: first.root.path }))?.urlId).toBe(first.root.urlId);
    expect((await find.execute({ siteId: second.root.siteId, path: first.root.path }))?.urlId).toBe(second.root.urlId);
    await expect(application.get<IGetUrlHistory>(GET_URL_HISTORY)
      .execute({ siteId: first.root.siteId, urlId: second.root.urlId })).rejects.toThrow();
  });

  it('allows only one transfer captured from the same previous URL state to succeed', async () => {
    const { root, repository } = await fixture();
    const operation = application.get<IChangePageUrl>(CHANGE_PAGE_URL);
    const one = moveInput(root);
    const actual = repository.changePageUrl.bind(repository);
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;

    vi.spyOn(repository, 'changePageUrl').mockImplementation(async (change) => {
      if (++arrived === 2) {
        release();
      }
      await gate;
      await actual(change);
    });
    const results = await Promise.allSettled([operation.execute(one), operation.execute({
      ...one,
      path: '/games/another/',
      segment: 'another',
      mark: `Another${sequence}`,
    })]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await repository.getHistory(root.urlId)).toHaveLength(1);
    expect((await repository.findCurrentByPage(one.pageId))?.kind).toBe(UrlKind.PAGE);
  });

  it('enforces partial unique indexes and serialized creation under competing saves', async () => {
    const { root, repository } = await fixture();
    const at = new Date();
    const fresh = (mark: string): Url => new Url({
      ...root.toState(),
      urlId: randomUUID(),
      mark,
      path: '/racing/',
      parentUrlId: null,
      pageId: `synthetic-${mark}`,
      createdAt: at,
      updatedAt: at,
      firstPublishedAt: at,
    });
    const results = await Promise.allSettled([repository.save(fresh(`RaceOne${sequence}`)),
      repository.save(fresh(`RaceTwo${sequence}`))]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const models = createRoutingModels(connection);
    const record = await models.urls.findOne({ _id: root.urlId }).lean().exec();

    if (!record) {
      throw new Error('Expected routing fixture');
    }
    await expect(models.urls.insertOne({
      ...record,
      _id: randomUUID(),
      mark: `Duplicate${sequence}`,
      markKey: `duplicate${sequence}`,
      path: '/duplicate-binding/',
    })).rejects.toMatchObject({ code: 11000 });
    await verifyMigrations(connection, 'migrations');
  });

  it('supports audited repository updates, protects immutable addresses and rejects redirect cycles', async () => {
    const { root, child, repository } = await fixture();
    const changed = new Url(root.toState());

    changed.redirectTo(child.urlId, UrlRedirectStatus.HTTP_301);
    const redirected = await repository.save(changed);

    expect(redirected.firstPublishedAt).toEqual(root.firstPublishedAt);
    expect((await repository.getHistory(root.urlId))[0]?.kind).toBe(UrlKind.PAGE);
    const cycle = new Url(child.toState());

    cycle.redirectTo(root.urlId, UrlRedirectStatus.HTTP_308);
    await expect(repository.save(cycle)).rejects.toBeInstanceOf(RoutingConflictError);
    expect((await repository.findById(child.urlId))?.kind).toBe(UrlKind.PAGE);
    expect(await repository.getHistory(child.urlId)).toEqual([]);

    if (root.pageId === null) {
      throw new Error('Expected original PAGE binding');
    }
    redirected.bindToPage(root.pageId);
    await repository.save(redirected);
    expect(await repository.getHistory(root.urlId)).toHaveLength(2);
    await expect(repository.save(new Url({ ...root.toState(), path: '/illegal-in-place-move/' })))
      .rejects.toBeInstanceOf(RoutingConflictError);
    expect((await repository.findById(root.urlId))?.path).toBe(root.path);
  });
});
