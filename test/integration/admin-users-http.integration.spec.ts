import 'reflect-metadata';

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { INestApplication } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { type Browser, chromium, type Locator, type Page } from 'playwright-core';
import sharp from 'sharp';

import { object, string } from '../../admin/src/shared/api/content-api.js';
import {
  databaseRecords, DumpDatabase,
} from '../../src/adapters/outbound/backup/mongoose/dump-database.adapter.js';
import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { MongoosePageRepository } from '../../src/adapters/outbound/persistence/mongoose/pages/page.repository.js';
import type { IUrlRecord } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { toRecord } from '../../src/adapters/outbound/persistence/mongoose/routing/url.repository.js';
import type { AddonPackageRegistry }
  from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { paginationParameters, paginationSnippetSource } from '../../src/domain/rendering/pagination-snippet.js';
import { ADDON_PACKAGE_REGISTRY } from '../../src/infra/addons/addons.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { PUBLICATION_STORE, RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { account } from '../support/admin-users.js';
import { urlFixture } from '../support/routing.js';

interface IAdminHttpFixture {
  readonly app: INestApplication;
  readonly base: string;
  readonly origin: string;
  readonly connection: Connection;
  readonly directory: string;
  readonly password: string;
  readonly login: (email: string, value?: string) => Promise<string>;
  readonly request: (route: string, body?: unknown, cookie?: string) => Promise<Response>;
}

async function withAdminHttpFixture(
  run: (fixture: IAdminHttpFixture) => Promise<void>,
  { media = false }: { media?: boolean } = {},
): Promise<void> {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zarya-admin-users-'));
  const connection: Connection = await createConnection(mongoUri, {
    dbName: database, autoCreate: false, autoIndex: false,
  }).asPromise();

  function assertSafeDatabase(): void {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe test database');
    }
  }
  function assertSafeDirectory(): void {
    if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith('zarya-admin-users-')) {
      throw new Error('Unsafe fixture directory');
    }
  }
  let app: INestApplication<Server> | undefined;
  let base = '';
  let origin = '';
  const password = 'synthetic initial password';

  async function request(route: string, body?: unknown, cookie?: string): Promise<Response> {
    return fetch(base + '/api/admin' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Host: new URL(origin).host,
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function login(email: string, value = password): Promise<string> {
    const response = await request('/auth/login', { email, password: value });

    expect(response.status).toBe(200);

    return string(response.headers.get('set-cookie')).split(';')[0]!;
  }

  try {
    await applyMigrations(connection, 'migrations');
    const passwords = new ScryptAdminPasswordAdapter();
    const store = new MongooseAdminUserStore(connection);

    await store.run(async (users) => users.save(new AdminUser({
      ...account().toState(), passwordDigest: await passwords.hash(password),
    }), null));
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const reserved = probe.address();

    if (!reserved || typeof reserved === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    origin = 'http://127.0.0.1:' + reserved.port;
    app = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: reserved.port,
      sourcesRoot: path.join(directory, 'sites'),
      artifactsRoot: path.join(directory, 'artifacts'),
      dumpsRoot: path.join(directory, 'dumps'),
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
      ...(media ? { media: { root: path.join(directory, 'media'), publicBaseUrl: '/assets' } } : {}),
    });
    const address = app.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing server address');
    }
    base = 'http://127.0.0.1:' + address.port;
    await run({ app, base, origin, connection, directory, password, request, login });
  } finally {
    await app?.close();

    try {
      assertSafeDatabase();
      await connection.dropDatabase();
    } finally {
      await connection.close();

      assertSafeDirectory();
      await rm(directory, { recursive: true, force: true });
    }
  }
}

it('manages accounts through real HTTP, session revocation and last-account guards', { timeout: 45000 }, () =>
  withAdminHttpFixture(async ({ base, origin, connection, directory, password, request, login }) => {
    const changedPassword = 'synthetic changed password';
    const unauthenticatedStatus = await new Promise<number>((resolve, reject) => {
      const pending = httpRequest(base + '/api/admin/users', {
        method: 'POST',
        headers: {
          Host: new URL(origin).host,
          Origin: origin,
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/json',
          'Content-Length': '10000000',
        },
      }, (response) => {
        response.resume();
        resolve(response.statusCode!);
        pending.destroy();
      });

      pending.on('error', reject);
      pending.setTimeout(3000, () => pending.destroy(new Error('Authentication waited for the body')));
      pending.flushHeaders();
    });

    expect(unauthenticatedStatus).toBe(401);
    const ownerCookie = await login('user-1@example.test');
    const initial = object(await (await request('/users?limit=1', undefined, ownerCookie)).json());

    expect(initial.currentAdminUserId).toBe('user-1');
    expect(JSON.stringify(initial)).not.toMatch(/password|Digest/);
    expect((await request('/users/user-1/block', {
      expectedVersion: 'user-1-v1', blocked: true,
    }, ownerCookie)).status).toBe(403);
    expect((await request('/users', {
      email: 'new@example.test', password, actorId: 'forged',
    }, ownerCookie)).status).toBe(400);
    const createdResponse = await request('/users', { email: ' NEW@EXAMPLE.TEST ', password }, ownerCookie);

    expect(createdResponse.status).toBe(201);
    const created = object(await createdResponse.json());
    const userId = string(created.adminUserId);
    const createdVersion = string(created.version);

    expect(created.email).toBe('new@example.test');
    expect(created).not.toHaveProperty('passwordDigest');
    const stored = await connection.collection('admin_users').findOne({ email: 'new@example.test' });

    expect(stored?.passwordDigest).toMatch(/^scrypt\$v1\$/);
    expect((await request('/users', { email: 'NEW@example.test', password }, ownerCookie)).status).toBe(409);
    const first = object(await (await request('/users?limit=1', undefined, ownerCookie)).json());

    expect(typeof first.nextCursor).toBe('string');
    const second = object(await (await request('/users?limit=1&cursor='
      + encodeURIComponent(string(first.nextCursor)), undefined, ownerCookie)).json());

    expect(second.nextCursor).toBeNull();
    const userCookie = await login('new@example.test');
    const updatedResponse = await request('/users/' + userId + '/password', {
      expectedVersion: createdVersion, password: changedPassword,
    }, ownerCookie);
    const updated = object(await updatedResponse.json());
    const updatedUser = object(updated.user);

    expect(updatedResponse.status).toBe(200);
    expect(updated.currentSessionInvalidated).toBe(false);
    expect((await request('/auth/me', undefined, userCookie)).status).toBe(401);
    const changedCookie = await login('new@example.test', changedPassword);

    expect((await request('/users/' + userId + '/block', {
      expectedVersion: createdVersion, blocked: true,
    }, ownerCookie)).status).toBe(409);
    const blocked = object(await (await request('/users/' + userId + '/block', {
      expectedVersion: string(updatedUser.version), blocked: true,
    }, ownerCookie)).json());

    expect(blocked.blocked).toBe(true);
    expect((await request('/auth/me', undefined, changedCookie)).status).toBe(401);
    const unblocked = object(await (await request('/users/' + userId + '/block', {
      expectedVersion: string(blocked.version), blocked: false,
    }, ownerCookie)).json());

    expect(unblocked.blocked).toBe(false);
    const unblockedCookie = await login('new@example.test', changedPassword);
    const deleted = await request('/users/' + userId + '/delete', {
      expectedVersion: string(unblocked.version),
    }, ownerCookie);

    expect(deleted.status).toBe(200);
    expect((await request('/auth/me', undefined, unblockedCookie)).status).toBe(401);
    expect(await connection.collection('admin_users').countDocuments({ deletedAt: { $ne: null } })).toBe(1);
    expect((await request('/users/user-1/delete', { expectedVersion: 'user-1-v1' }, ownerCookie)).status).toBe(409);
    const createSite = async (mark: string): Promise<string> => {
      const result = await request('/sites', {
        mark,
        name: mark,
        primaryDomain: mark.toLowerCase() + '.example.test',
        languages: ['en'],
        defaultLanguage: 'en',
      }, ownerCookie);

      expect(result.status).toBe(201);

      return string(object(await result.json()).siteId);
    };
    const one = await createSite('RoleSiteOne');
    const two = await createSite('RoleSiteTwo');
    const selected = '/sites/' + one;
    const siteAdmin = await request('/users', {
      email: 'site-admin@example.test', password, roleId: 'cms.system.site-admin', siteId: one,
    }, ownerCookie);

    expect(siteAdmin.status).toBe(201);
    const siteAdminCookie = await login('site-admin@example.test');
    const current = object(await (await request('/auth/me', undefined, siteAdminCookie)).json());

    expect(object(current.user).authorization).toMatchObject({
      systemAdmin: false, siteIds: [one], siteAdminSiteIds: [one],
    });
    const picker = object(await (await request('/sites', undefined, siteAdminCookie)).json());

    expect(picker.items).toMatchObject([{ siteId: one }]);
    expect(await request(selected + '/settings', undefined, siteAdminCookie)).toHaveProperty('status', 200);

    for (const [roleId, sessionCookie] of [
      ['cms.system.admin', ownerCookie],
      ['cms.system.site-admin', siteAdminCookie],
    ] as const) {
      const permission = { siteId: null, roleId, actionId: 'cms.site-settings.read' };
      const grants = connection.db!.collection('role_permissions');
      const grant = await grants.findOneAndDelete(permission);

      try {
        expect(await request(selected + '/settings', undefined, sessionCookie)).toHaveProperty('status', 403);
        expect(grant).not.toBeNull();
      } finally {
        if (grant) {
          await grants.insertOne(grant);
        }
      }
      expect(await request(selected + '/settings', undefined, sessionCookie)).toHaveProperty('status', 200);
    }
    expect(await request('/sites/' + two + '/pages', undefined, siteAdminCookie)).toHaveProperty('status', 403);
    expect(await request('/installation/settings', undefined, siteAdminCookie)).toHaveProperty('status', 403);
    expect(await request('/users', undefined, siteAdminCookie)).toHaveProperty('status', 403);

    const manager = await request('/users', {
      email: 'manager@example.test', password, roleId: 'cms.system.manager', siteId: one,
    }, ownerCookie);

    expect(manager.status).toBe(201);
    const managerCookie = await login('manager@example.test');

    expect(await request('/sites', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/pages', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/chunks', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/snippets', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request('/sites/' + two + '/pages', undefined, managerCookie)).toHaveProperty('status', 403);
    expect(await request('/installation/settings', undefined, managerCookie)).toHaveProperty('status', 403);
    expect(await request(selected + '/settings', undefined, ownerCookie)).toHaveProperty('status', 200);
    const catalogResponse = await request(selected + '/access', undefined, siteAdminCookie);

    expect(catalogResponse.status).toBe(200);
    const catalog = object(await catalogResponse.json());

    expect(catalog.managerActionIds).toEqual(expect.arrayContaining([
      'cms.publication.site-options', 'cms.publication.page-options', 'cms.publication.publish-page', 'cms.urls.publish',
    ]));
    expect(catalog.managerActionIds).not.toContain('cms.publication.publish-site');
    expect(await request(selected + '/publication', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/settings', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/urls/publish', {}, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/publish', {}, managerCookie)).toHaveProperty('status', 403);
    const globalCatalog = object(await (await request(selected + '/access', undefined, ownerCookie)).json());
    const groups = Array.isArray(globalCatalog.groups) ? globalCatalog.groups.map(object) : [];

    expect(catalog.groups).toMatchObject([{ name: 'Site', members: [{ email: 'site-admin@example.test' }] }]);
    expect(groups).toMatchObject([
      { name: 'Global', members: expect.arrayContaining([expect.objectContaining({ email: 'user-1@example.test' })]) },
      { name: 'Site', members: [{ email: 'site-admin@example.test' }] },
    ]);

    for (const { groupId } of groups) {
      expect(await request(selected + '/access', {
        revision: globalCatalog.revision, actionIds: [], group: { groupId, remove: true },
      }, ownerCookie)).toHaveProperty('status', 403);
    }

    expect(catalog.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: 'cms.authorization.read' }),
    ]));
    expect(catalog.delegableActionIds).toContain('cms.pages.list');
    expect(catalog.delegableActionIds).not.toContain('cms.authorization.read');

    for (const roleId of ['cms.system.admin', 'cms.system.site-admin']) {
      expect(await request(selected + '/access', {
        revision: null, actionIds: [], role: { roleId, remove: true },
      }, siteAdminCookie)).toHaveProperty('status', 403);
      expect(await request(selected + '/access', {
        revision: null,
        actionIds: ['cms.pages.list'],
        role: { roleId, key: 'fixed', name: 'Fixed', description: 'Fixed role', actorIds: [] },
      }, ownerCookie)).toHaveProperty('status', 403);
    }
    const managerGrant = await request(selected + '/access', {
      revision: null, actionIds: ['cms.pages.list'],
    }, siteAdminCookie);

    expect(managerGrant.status).toBe(200);
    expect(await request(selected + '/pages', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/settings', undefined, managerCookie)).toHaveProperty('status', 403);
    expect(await request(selected + '/access', undefined, managerCookie)).toHaveProperty('status', 403);
    const grant = object(await managerGrant.json());
    const revoked = await request(selected + '/access', {
      revision: grant.revision, actionIds: [],
    }, ownerCookie);

    expect(revoked.status).toBe(200);
    expect(await request(selected + '/pages', undefined, managerCookie)).toHaveProperty('status', 403);

    const managerProfile = object(await manager.json());
    const revokedView = object(await revoked.json());
    const role = {
      roleId: null,
      key: 'page-reader',
      name: 'Page reader',
      description: 'Read the page list',
      actorIds: [managerProfile.adminUserId],
    };
    const createdRole = await request(selected + '/access', {
      revision: revokedView.revision, actionIds: ['cms.pages.list'], role,
    }, siteAdminCookie);

    expect(createdRole.status).toBe(200);
    const roleView = object(await createdRole.json());
    const savedRole = object(Array.isArray(roleView.customRoles) ? roleView.customRoles[0] : undefined);

    expect(savedRole).toMatchObject({ name: 'Page reader', actionIds: ['cms.pages.list'] });
    expect(await request('/users', {
      email: 'foreign-role@example.test', password, roleId: savedRole.roleId, siteId: two,
    }, ownerCookie)).toHaveProperty('status', 400);
    expect(await connection.collection('admin_users').countDocuments({ email: 'foreign-role@example.test' })).toBe(0);
    expect(await request('/users', {
      email: 'custom-reader@example.test', password, roleId: savedRole.roleId, siteId: one,
    }, ownerCookie)).toHaveProperty('status', 201);
    const customCookie = await login('custom-reader@example.test');

    expect(await request(selected + '/pages', undefined, customCookie)).toHaveProperty('status', 200);
    expect(await request('/sites/' + two + '/pages', undefined, customCookie)).toHaveProperty('status', 403);
    expect(await request(selected + '/pages', undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/settings', undefined, managerCookie)).toHaveProperty('status', 403);
    const removedRole = await request(selected + '/access', {
      revision: roleView.revision, actionIds: [], role: { roleId: savedRole.roleId, remove: true },
    }, siteAdminCookie);

    expect(removedRole.status).toBe(200);
    expect(await request(selected + '/pages', undefined, managerCookie)).toHaveProperty('status', 403);

    const removedRoleView = object(await removedRole.json());
    const group = {
      groupId: null,
      key: 'editors',
      name: 'Editors',
      description: 'Editors of this site',
      actorIds: [managerProfile.adminUserId],
    };

    expect(await request(selected + '/access', {
      revision: removedRoleView.revision, actionIds: [], group: { ...group, actorIds: ['user-1'] },
    }, siteAdminCookie)).toHaveProperty('status', 400);
    expect(await request(selected + '/access', {
      revision: removedRoleView.revision, actionIds: [], group,
    }, managerCookie)).toHaveProperty('status', 403);
    const createdGroup = await request(selected + '/access', {
      revision: removedRoleView.revision, actionIds: [], group,
    }, siteAdminCookie);

    expect(createdGroup.status).toBe(200);
    const groupView = object(await createdGroup.json());
    const savedGroup = Array.isArray(groupView.groups)
      ? groupView.groups.map(object).find((group) => group.key === 'editors')! : {};

    expect(savedGroup).toMatchObject({ name: 'Editors', actorIds: [managerProfile.adminUserId] });
    expect(await request(selected + '/pages', undefined, managerCookie)).toHaveProperty('status', 403);
    const scopes = {
      'cms.pages.create': ['own', 'groups'],
      'cms.pages.list': ['own', 'groups'],
      'cms.pages.read': ['own', 'groups'],
      'cms.pages.update': ['own', 'groups'],
      'cms.chunks.create': ['own'],
      'cms.chunks.read': ['own', 'groups'],
      'cms.chunks.update': ['groups'],
      'cms.snippets.read': ['groups'],
      'cms.snippets.list': ['groups'],
    };
    const scoped = await request(selected + '/access', {
      revision: groupView.revision, actionIds: Object.keys(scopes), objectScopes: scopes,
    }, siteAdminCookie);

    expect(scoped.status).toBe(200);
    const scopedView = object(await scoped.json());
    const content = { language: 'en', contentMd: '' };
    const privatePage = await request(selected + '/pages', {
      ...content, mark: 'PrivateArticle', title: 'Private article',
    }, siteAdminCookie);
    const ownPage = await request(selected + '/pages', {
      ...content, mark: 'OwnArticle', title: 'Own article', h1: 'Own article',
    }, managerCookie);
    const groupPage = await request(selected + '/pages', {
      ...content, mark: 'GroupArticle', title: 'Group article', accessGroupId: savedGroup.groupId,
    }, siteAdminCookie);

    expect(privatePage.status).toBe(201);
    expect(ownPage.status).toBe(201);
    expect(groupPage.status).toBe(201);
    const [privateState, ownState, groupState] = await Promise.all(
      [privatePage, ownPage, groupPage].map(async (response) => object(await response.json())),
    );
    const visible = await request(selected + '/pages', undefined, managerCookie);
    const visibleList = object(await visible.json());
    const visiblePages = Array.isArray(visibleList.items) ? visibleList.items.map(object) : [];

    expect(visiblePages.map(({ pageId }) => pageId).sort()).toEqual([ownState?.pageId, groupState?.pageId].sort());
    expect(await request(selected + '/pages/' + privateState?.pageId, undefined, managerCookie))
      .toHaveProperty('status', 404);
    expect(await request(selected + '/pages/' + ownState?.pageId, {
      title: 'Own updated', contentMd: '',
    }, managerCookie))
      .toHaveProperty('status', 200);
    expect(await request(selected + '/pages/' + groupState?.pageId, {
      title: 'Group updated', contentMd: '',
    }, managerCookie))
      .toHaveProperty('status', 200);
    expect(await request(selected + '/pages/' + privateState?.pageId, {
      title: 'Wrong scope', contentMd: '',
    }, managerCookie))
      .toHaveProperty('status', 404);

    const groupAssignment = { domain: 'pages', objectId: privateState?.pageId, accessGroupId: savedGroup.groupId };

    expect(await request(selected + '/access/object-group', groupAssignment, managerCookie))
      .toHaveProperty('status', 403);
    expect(await request(selected + '/access/object-group', groupAssignment, siteAdminCookie))
      .toHaveProperty('status', 200);
    expect(await request(selected + '/pages/' + privateState?.pageId, undefined, managerCookie))
      .toHaveProperty('status', 200);
    expect(await request(selected + '/access/object-group', {
      ...groupAssignment, accessGroupId: null,
    }, siteAdminCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/pages/' + privateState?.pageId, undefined, managerCookie))
      .toHaveProperty('status', 404);

    const chunkSource = { html: '<p>Example</p>', css: '', browserTypeScript: null, parameters: [] };
    const ownChunk = await request(selected + '/chunks', { ...chunkSource, name: 'Own chunk' }, managerCookie);
    const groupChunk = await request(selected + '/chunks', {
      ...chunkSource, name: 'Group chunk', accessGroupId: savedGroup.groupId,
    }, siteAdminCookie);
    const groupSnippet = await request(selected + '/snippets', {
      ...chunkSource,
      html: '',
      name: 'Group snippet',
      parameters: paginationParameters,
      snippet: paginationSnippetSource,
      accessGroupId: savedGroup.groupId,
    }, siteAdminCookie);

    expect(ownChunk.status).toBe(201);
    expect(groupChunk.status).toBe(201);
    expect(groupSnippet.status).toBe(201);
    const ownChunkState = object(await ownChunk.json());
    const groupChunkState = object(await groupChunk.json());
    const groupSnippetState = object(await groupSnippet.json());
    const ownChunkPath = selected + '/chunks/' + ownChunkState.key;
    const groupChunkPath = selected + '/chunks/' + groupChunkState.key;

    expect(await request(ownChunkPath, undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(groupChunkPath, undefined, managerCookie)).toHaveProperty('status', 200);
    expect(await request(ownChunkPath, {
      ...chunkSource, name: 'Disallowed update', expectedVersion: ownChunkState.version,
    }, managerCookie)).toHaveProperty('status', 404);
    expect(await request(groupChunkPath, {
      ...chunkSource, name: 'Updated group chunk', expectedVersion: groupChunkState.version,
    }, managerCookie)).toHaveProperty('status', 200);
    expect(await request(selected + '/snippets/' + groupSnippetState.key, undefined, managerCookie))
      .toHaveProperty('status', 200);
    const snippetResponse = await request(selected + '/snippets', undefined, managerCookie);

    expect((object(await snippetResponse.json())).items).toMatchObject([{ key: groupSnippetState.key }]);

    let recordEntry!: () => void;
    let resumeUpdate!: () => void;
    const entered = new Promise<void>((resolve) => {
      recordEntry = resolve;
    });
    const released = new Promise<void>((resolve) => {
      resumeUpdate = resolve;
    });
    const savePage = MongoosePageRepository.prototype.save;
    const stopWrite = vi.spyOn(MongoosePageRepository.prototype, 'save')
      .mockImplementation(async function(this: MongoosePageRepository, ...args) {
        if (args[0].title === 'Interrupted update') {
          recordEntry();
          await released;
        }

        return savePage.apply(this, args);
      });
    const staleUpdate = request(selected + '/pages/' + groupState?.pageId, {
      title: 'Interrupted update', contentMd: '',
    }, managerCookie);

    try {
      await Promise.race([entered, staleUpdate.then(() => {
        throw new Error('Write never reached persistence');
      })]);
      const archivedGroup = await request(selected + '/access', {
        revision: scopedView.revision, actionIds: [], group: { groupId: savedGroup.groupId, remove: true },
      }, siteAdminCookie);

      expect(archivedGroup.status).toBe(200);
      expect(await archivedGroup.json()).toMatchObject({ groups: [{ groupId: 'cms.system.group.site' }] });
    } finally {
      resumeUpdate();
      stopWrite.mockRestore();
    }

    expect((await staleUpdate).status).toBe(409);
    const unchanged = await request(selected + '/pages/' + groupState?.pageId, undefined, siteAdminCookie);

    expect(await unchanged.json()).toMatchObject({ title: 'Group updated' });
    expect(await request(selected + '/pages/' + groupState?.pageId, undefined, managerCookie))
      .toHaveProperty('status', 404);
    expect(await request(selected + '/pages/' + ownState?.pageId, undefined, managerCookie))
      .toHaveProperty('status', 200);

    const portableName = path.join(directory, 'auth-content-dump.jsonl');
    const portable = new DumpDatabase(connection);
    const capture = await portable.capture(one, portableName);
    let foundOwnPage = false;

    for await (const row of databaseRecords(portableName)) {
      if (row.collection === 'pages' && row.document._id === ownState?.pageId) {
        expect(row.document).not.toHaveProperty('createdBy');
        expect(row.document).not.toHaveProperty('accessGroupId');
        foundOwnPage = true;
      }
    }
    expect(foundOwnPage).toBe(true);
    await portable.replace(one, portableName, capture, async () => {});
    const pageAfterImport = await request(selected + '/pages/' + ownState?.pageId, undefined, managerCookie);

    expect(pageAfterImport.status).toBe(200);
    const own = await request('/users/user-1/password', {
      expectedVersion: 'user-1-v1', password: changedPassword,
    }, ownerCookie);

    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ currentSessionInvalidated: true });
    expect(own.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await request('/auth/me', undefined, ownerCookie)).status).toBe(401);
    await login('user-1@example.test', changedPassword);
    await verifyMigrations(connection, 'migrations');
  }));

it('shows category dump choices only to a system administrator', { timeout: 40000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const owner = await login('user-1@example.test');
    const created = await request('/sites', {
      mark: 'DumpCategories',
      name: 'Dump categories',
      primaryDomain: 'dump-categories.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(created.status).toBe(201);
    const siteId = string(object(await created.json()).siteId);
    const route = '/sites/' + siteId;
    const email = 'dump-category-site-admin@example.test';

    expect(await request('/users', { email, password, roleId: 'cms.system.site-admin', siteId }, owner))
      .toHaveProperty('status', 201);
    const siteAdmin = await login(email);

    expect(await request(route + '/dumps/create', { type: 'Chunks', itemIds: ['chunk'] }, siteAdmin))
      .toHaveProperty('status', 403);
    const browser = await launchAdminBrowser();

    try {
      for (const [account, types] of [
        [email, ['Site']],
        ['user-1@example.test', ['Site', 'Snippets', 'Chunks', 'Templates', 'Addons', 'Files']],
      ] as const) {
        const page = await browser.newPage();

        await signInAdminBrowser(page, origin, account, password);
        await page.goto(origin + '/admin' + route);
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('button', { name: 'Dumps', exact: true }).click();
        const choices = page.getByLabel('Dump type', { exact: true });

        await choices.waitFor();
        expect(await choices.locator('option').evaluateAll((options) => options.map((option) =>
          option instanceof HTMLOptionElement ? option.value : null))).toEqual(types);
        expect(await page.getByText('Category dumps are available to system administrators.').isVisible())
          .toBe(account === email);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }));

it('separates all four archive operations and protects the global group', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ base, origin, connection, directory, password, request, login }) => {
    const owner = await login('user-1@example.test');
    const makeSite = async (mark: string): Promise<string> => {
      const created = await request('/sites', {
        mark, name: mark, primaryDomain: mark.toLowerCase() + '.example.test', languages: ['en'], defaultLanguage: 'en',
      }, owner);

      expect(created.status).toBe(201);

      return string(object(await created.json()).siteId);
    };
    const ownId = await makeSite('ArchiveSite');
    const foreignId = await makeSite('ForeignSite');
    const own = '/sites/' + ownId;
    const foreign = '/sites/' + foreignId;
    const account = await request('/users', {
      email: 'archive-admin@example.test', password, roleId: 'cms.system.site-admin', siteId: ownId,
    }, owner);

    expect(account.status).toBe(201);
    const siteAdmin = await login('archive-admin@example.test');
    const archiveState = object(await (await request(own + '/access', undefined, siteAdmin)).json());
    const groupRows = Array.isArray(archiveState.groups) ? archiveState.groups.map(object) : [];

    expect(groupRows).toEqual([expect.objectContaining({
      name: 'Site',
      members: [expect.objectContaining({ email: 'archive-admin@example.test' })],
    })]);
    expect(await request('/users', {
      email: 'archive-manager@example.test', password, roleId: 'cms.system.manager', siteId: ownId,
    }, owner)).toHaveProperty('status', 201);
    const manager = await login('archive-manager@example.test');

    expect(await request(own + '/access', undefined, manager)).toHaveProperty('status', 403);
    expect(await request(own + '/dumps/create', {}, manager)).toHaveProperty('status', 403);
    const globalGroupId = 'cms.system.group.global';
    const groupFilter = { siteId: null, groupId: globalGroupId };
    const groups = connection.db!.collection('access_groups');
    const protectedGroup = await groups.findOne(groupFilter);

    expect(protectedGroup).toMatchObject({ name: 'Global', status: 'active' });

    for (const group of [
      { groupId: globalGroupId, remove: true },
      { groupId: globalGroupId, key: 'global', name: 'Changed', description: 'Changed group', actorIds: [] },
    ]) {
      expect(await request(own + '/access', { revision: archiveState.revision, actionIds: [], group }, siteAdmin))
        .toHaveProperty('status', 403);
    }
    expect(await request(own + '/access/object-group', {
      domain: 'chunks', objectId: 'example', accessGroupId: globalGroupId,
    }, siteAdmin)).toHaveProperty('status', 400);
    expect(await groups.findOne(groupFilter)).toEqual(protectedGroup);

    const installation = own + '/dumps/installation';

    expect(await request(installation + '/create', {}, siteAdmin)).toHaveProperty('status', 403);
    expect(await request(installation + '/restore', {}, siteAdmin)).toHaveProperty('status', 403);
    expect(await request(foreign + '/dumps/create', {}, siteAdmin)).toHaveProperty('status', 403);
    expect(await request(own + '/dumps/create', { type: 'Installation' }, siteAdmin)).toHaveProperty('status', 400);
    expect(await request(own + '/dumps/create', {
      type: 'Addons', itemIds: ['events'], addonParts: { configuration: false, businessData: false, package: true },
    }, siteAdmin)).toHaveProperty('status', 403);
    expect(await (await request(own + '/dumps', undefined, siteAdmin)).json()).toMatchObject({ items: [] });

    const siteDump = await request(own + '/dumps/create', {}, siteAdmin);

    expect(siteDump.status).toBe(201);
    const { filename } = object(await siteDump.json());
    const applySite = '/dumps/' + string(filename) + '/restore';

    expect(await request(foreign + applySite, {}, siteAdmin)).toHaveProperty('status', 403);
    const sites = connection.db!.collection<{ _id: string; name: string }>('sites');

    await sites.updateOne({ _id: ownId }, { $set: { name: 'Changed site' } });
    expect(await request(own + applySite, {}, siteAdmin)).toHaveProperty('status', 200);
    expect(await sites.findOne({ _id: ownId })).toMatchObject({ name: 'ArchiveSite' });
    expect(await sites.findOne({ _id: foreignId })).toMatchObject({ name: 'ForeignSite' });
    expect(await groups.findOne(groupFilter)).toEqual(protectedGroup);

    const installationFiles = [ownId, foreignId]
      .map((id) => path.join(directory, 'sites', id, 'installation-check.txt'));

    for (const file of installationFiles) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, 'Before capture');
    }
    const created = await request(installation + '/create', {}, owner);

    expect(created.status, await created.clone().text()).toBe(201);
    const installationFilename = string(object(await created.json()).filename);

    expect(await request(installation + '/' + installationFilename, undefined, siteAdmin))
      .toHaveProperty('status', 403);
    const fullDownload = await request(installation + '/' + installationFilename, undefined, owner);

    expect(fullDownload.status).toBe(200);
    expect(fullDownload.headers.get('content-type')).toBe('application/gzip');
    const archive = Buffer.from(await fullDownload.arrayBuffer());
    const restoreInstallation = (body: Buffer, cookie: string): Promise<Response> => fetch(
      base + '/api/admin' + installation + '/restore', {
        method: 'POST',
        headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/gzip', Cookie: cookie },
        body: new Uint8Array(body),
      },
    );
    const download = await request(own + '/dumps/' + string(filename), undefined, owner);

    expect(download.status).toBe(200);
    const wrongScope = Buffer.from(await download.arrayBuffer());
    const uploadSite = await fetch(base + '/api/admin' + own + '/dumps/import', {
      method: 'POST',
      headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/gzip', Cookie: owner },
      body: new Uint8Array(archive),
    });

    expect(uploadSite.status).toBe(400);
    await sites.updateOne({ _id: ownId }, { $set: { name: 'Changed own site' } });
    await sites.updateOne({ _id: foreignId }, { $set: { name: 'Changed foreign site' } });
    await Promise.all(installationFiles.map((file) => writeFile(file, 'After capture')));
    expect(await restoreInstallation(archive, siteAdmin)).toHaveProperty('status', 403);
    expect(await restoreInstallation(wrongScope, owner)).toHaveProperty('status', 400);
    expect(await restoreInstallation(Buffer.from('not an archive'), owner)).toHaveProperty('status', 400);
    expect(await sites.findOne({ _id: ownId })).toMatchObject({ name: 'Changed own site' });
    expect(await sites.findOne({ _id: foreignId })).toMatchObject({ name: 'Changed foreign site' });
    expect(await Promise.all(installationFiles.map((file) => readFile(file, 'utf8'))))
      .toEqual(['After capture', 'After capture']);
    const browser = await launchAdminBrowser();

    try {
      async function openDumps(email: string): Promise<Page> {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        await signInAdminBrowser(page, origin, email, password);
        await page.goto(origin + '/admin' + own);
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('button', { name: 'Dumps', exact: true }).click();
        await page.getByRole('button', { name: 'Create dump', exact: true }).waitFor();

        return page;
      }
      const restricted = await openDumps('archive-admin@example.test');

      expect(await restricted.getByRole('button', { name: 'Create installation dump', exact: true }).count()).toBe(0);
      expect(await restricted.getByLabel('Installation archive file', { exact: true }).count()).toBe(0);

      const page = await openDumps('user-1@example.test');
      const panel = page.getByRole('region', { name: 'Installation archive', exact: true });
      const picker = panel.getByRole('button', { name: 'Installation archive file', exact: true });
      const create = panel.getByRole('button', { name: 'Create installation dump', exact: true });
      const restore = panel.getByRole('button', { name: 'Restore installation dump', exact: true });
      const cards = panel.locator('._dump-installation-transfers > ._dump-panel');

      expect(await cards.count()).toBe(2);
      expect(await restore.isDisabled()).toBe(true);
      expect(await picker.isVisible()).toBe(true);
      expect(await panel.locator('input[type=file]').isHidden()).toBe(true);
      const left = (await cards.nth(0).boundingBox())!;
      const right = (await cards.nth(1).boundingBox())!;

      expect(left.y).toBe(right.y);
      expect(right.x).toBeGreaterThan(left.x + left.width);
      expect((await create.boundingBox())!.width).toBeLessThan(left.width - 40);
      expect((await restore.boundingBox())!.width).toBeLessThan(right.width - 40);
      await panel.screenshot({ path: path.resolve('.tmp/dump-installation-desktop.png') });
      await page.setViewportSize({ width: 390, height: 900 });
      const above = (await cards.nth(0).boundingBox())!;
      const below = (await cards.nth(1).boundingBox())!;

      expect(above.x).toBe(below.x);
      expect(below.y).toBeGreaterThan(above.y + above.height);
      await panel.screenshot({ path: path.resolve('.tmp/dump-installation-mobile.png') });
      await page.setViewportSize({ width: 1440, height: 900 });

      async function upload(buffer: Buffer): Promise<number> {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), picker.click()]);

        await chooser.setFiles({ name: 'installation.gz', mimeType: 'application/gzip', buffer });
        await picker.getByText('installation.gz', { exact: true }).waitFor();
        expect(await restore.isEnabled()).toBe(true);
        const confirmation = page.waitForEvent('dialog').then(async (dialog) => {
          const message = dialog.message();

          await dialog.accept();
          expect(message).toContain('You will need to sign in again.');
        });
        const [response] = await Promise.all([
          page.waitForResponse((result) => result.url() === origin + '/api/admin' + installation + '/restore'),
          confirmation,
          restore.click(),
        ]);

        return response.status();
      }

      expect(await upload(Buffer.from('not an archive'))).toBe(400);
      await page.getByRole('alert').waitFor();
      expect(await sites.findOne({ _id: ownId })).toMatchObject({ name: 'Changed own site' });
      expect(await Promise.all(installationFiles.map((file) => readFile(file, 'utf8'))))
        .toEqual(['After capture', 'After capture']);

      expect(await upload(archive)).toBe(200);
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      expect(await sites.findOne({ _id: ownId })).toMatchObject({ name: 'ArchiveSite' });
      expect(await sites.findOne({ _id: foreignId })).toMatchObject({ name: 'ForeignSite' });
      expect(await Promise.all(installationFiles.map((file) => readFile(file, 'utf8'))))
        .toEqual(['Before capture', 'Before capture']);
      expect(await request('/auth/me', undefined, owner)).toHaveProperty('status', 401);
      await signInAdminBrowser(page, origin, 'user-1@example.test', password);
      expect(await request(own + '/dumps', undefined, await login('archive-admin@example.test')))
        .toHaveProperty('status', 200);
    } finally {
      await browser.close();
    }
  }));

function launchAdminBrowser(): Promise<Browser> {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  return chromium.launch({ executablePath, headless: true });
}

async function signInAdminBrowser(page: Page, origin: string, email: string, password: string): Promise<void> {
  page.setDefaultTimeout(7000);
  await page.goto(origin + '/admin/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse((response) => response.url() === origin + '/api/admin/auth/login');

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'hidden' });
}

async function getFixturePublicHtml(base: string, host: string, pathname: string): Promise<string> {
  const result = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    const pending = httpRequest(base + pathname, { headers: { Host: host } }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, body }));
      response.on('error', reject);
    });

    pending.on('error', reject);
    pending.end();
  });

  expect(result.status).toBe(200);

  return result.body;
}

async function uploadFixturePng(
  origin: string, filesRoute: string, expectedVersion: unknown, cookie: string, filename: string,
  mode = 'Original', size = 32,
): Promise<Record<string, unknown>> {
  const bytes = await sharp({ create: { width: size, height: size, channels: 3, background: '#224477' } })
    .png().toBuffer();
  const uploaded = await fetch(origin + '/api/admin' + filesRoute, {
    method: 'POST',
    body: new Uint8Array(bytes),
    headers: {
      Cookie: cookie,
      Origin: origin,
      'X-Zarya-Admin': '1',
      'Content-Type': 'application/octet-stream',
      'X-Zarya-File-Metadata': encodeURIComponent(JSON.stringify({
        expectedVersion, filename, folderId: null, mode,
      })),
    },
  });

  expect(uploaded.status, await uploaded.clone().text()).toBe(200);

  return object(await uploaded.json());
}

it('publishes a page and applies pending routes as a default Manager', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ app, base, origin, password, request, login }) => {
    const owner = await login('user-1@example.test');
    const primaryDomain = 'manager-publishing.example.test';
    const site = await request('/sites', {
      mark: 'ManagerPublishing', name: 'Manager publishing', primaryDomain, languages: ['en'], defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const email = 'publishing-manager@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const browser = await launchAdminBrowser();

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const adminSite = origin + '/admin' + siteRoute;
      const content = 'Published by the default Manager';

      await signInAdminBrowser(page, origin, email, password);
      await page.goto(adminSite + '/pages/new');
      await page.locator('#page-title').fill('Manager article');
      await page.locator('#page-h1').fill('Manager article');
      await page.locator('#page-content').fill(content);
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText('Draft saved', { exact: true }).waitFor();
      const row = page.getByRole('treeitem').filter({ hasText: 'Manager article' });

      await row.click();
      await page.locator('#page-template').selectOption('ZaryaBasic');
      await page.locator('#page-path').fill('/manager-article/');
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByText('Page published', { exact: true }).waitFor();
      expect(await getFixturePublicHtml(base, primaryDomain, '/manager-article/')).toContain(content);

      const urls = object(await (await request(siteRoute + '/urls', undefined, owner)).json());
      const entries = Array.isArray(urls.urls) ? urls.urls.map((item) => object(object(item).url)) : [];
      const route = entries.find((item) => item.path === '/manager-article/');

      expect(route).toBeDefined();
      const urlPath = siteRoute + '/urls/' + string(route?.urlId);
      const stage = vi.spyOn(app.get<IPublicationStorePort>(PUBLICATION_STORE), 'stage')
        .mockRejectedValueOnce(new Error('Synthetic routing publication failure'));

      try {
        await page.goto(origin + '/admin' + urlPath);
        await page.getByRole('textbox', { name: 'New URL path', exact: true }).fill('/manager-revised/');
        const [moved] = await Promise.all([
          page.waitForResponse((response) => response.url() === origin + '/api/admin' + urlPath + '/move'
            && response.request().method() === 'POST'),
          page.getByRole('button', { name: 'Change URL', exact: true }).click(),
        ]);

        expect(moved.status(), await moved.text()).toBe(202);
        expect(await getFixturePublicHtml(base, primaryDomain, '/manager-article/')).toContain(content);
      } finally {
        stage.mockRestore();
      }

      const apply = page.getByRole('button', { name: 'Apply URL changes', exact: true });
      const [applied] = await Promise.all([
        page.waitForResponse((response) => response.url() === origin + '/api/admin' + siteRoute + '/urls/publish'
          && response.request().method() === 'POST'),
        apply.click(),
      ]);

      expect(applied.status(), await applied.text()).toBe(200);
      expect(await getFixturePublicHtml(base, primaryDomain, '/manager-revised/')).toContain(content);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByText(/These settings are available to read/).waitFor();
      expect(await page.getByRole('button', { name: 'Rebuild site', exact: true }).count()).toBe(0);
      const manager = await login(email);

      expect(await request(siteRoute + '/publish', {}, manager)).toHaveProperty('status', 403);
    } finally {
      await browser.close();
    }
  }));

it('rejects a stale Access editor save and reloads the winning policy', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const ownerEmail = 'user-1@example.test';
    const owner = await login(ownerEmail);
    const site = await request('/sites', {
      mark: 'AccessRace',
      name: 'Access race',
      primaryDomain: 'access-race.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const managerEmail = 'access-race-manager@example.test';
    const siteAdminEmail = 'access-race-site-admin@example.test';

    expect(await request('/users', {
      email: managerEmail, password, siteId, roleId: 'cms.system.manager',
    }, owner)).toHaveProperty('status', 201);
    expect(await request('/users', {
      email: siteAdminEmail, password, siteId, roleId: 'cms.system.site-admin',
    }, owner)).toHaveProperty('status', 201);
    const manager = await login(managerEmail);
    const browser = await launchAdminBrowser();

    try {
      async function openRoles(email: string): Promise<Page> {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        await signInAdminBrowser(page, origin, email, password);
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('button', { name: 'Access', exact: true }).click();
        await page.getByRole('tab', { name: 'Roles and permissions', exact: true }).click();
        await page.getByLabel('Role', { exact: true }).selectOption({ label: 'Manager' });

        return page;
      }
      const winner = await openRoles(ownerEmail);
      const loser = await openRoles(siteAdminEmail);
      const listPages = (page: Page): Locator =>
        page.getByRole('checkbox', { name: 'List pages · All · Pages', exact: true });
      const readDraft = (page: Page): Locator =>
        page.getByRole('checkbox', { name: 'Read a draft page · All · Pages', exact: true });

      expect(await request(siteRoute + '/pages', undefined, manager)).toHaveProperty('status', 200);
      expect(await listPages(winner).isChecked()).toBe(true);
      expect(await readDraft(loser).isChecked()).toBe(true);
      await listPages(winner).uncheck();
      await readDraft(loser).uncheck();

      async function save(page: Page): Promise<number> {
        const [response] = await Promise.all([
          page.waitForResponse((result) => result.url() === origin + '/api/admin' + accessRoute
            && result.request().method() === 'POST'),
          page.getByRole('button', { name: 'Save', exact: true }).click(),
        ]);

        return response.status();
      }

      expect(await save(winner)).toBe(200);
      expect(await save(loser)).toBe(409);
      await loser.getByRole('alert').filter({ hasText: 'Unable to update access. Refresh and try again.' }).waitFor();
      expect(await listPages(loser).isChecked()).toBe(true);
      expect(await readDraft(loser).isChecked()).toBe(false);

      await loser.getByRole('button', { name: 'Discard changes', exact: true }).click();
      await loser.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect.poll(() => listPages(loser).isChecked()).toBe(false);
      expect(await readDraft(loser).isChecked()).toBe(true);
      expect(await request(siteRoute + '/pages', undefined, manager)).toHaveProperty('status', 403);
      const current = object(await (await request(accessRoute, undefined, owner)).json());

      expect(current.managerActionIds).toContain('cms.pages.read');
    } finally {
      await browser.close();
    }
  }));

it('opens and saves linked drafts with real page grants and limits write-only responses', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const ownerCookie = await login('user-1@example.test');
    const siteResponse = await request('/sites', {
      mark: 'PagePermissions',
      name: 'Page Permissions',
      primaryDomain: 'page-permissions.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, ownerCookie);

    expect(siteResponse.status).toBe(201);
    const siteId = string(object(await siteResponse.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const pagesRoute = siteRoute + '/pages';
    const draftResponse = await request(pagesRoute, {
      mark: 'PermissionDraft',
      title: 'Permission draft',
      language: 'en',
      contentMd: 'Private article',
      metaDescription: 'Private description',
    }, ownerCookie);

    expect(draftResponse.status).toBe(201);
    const pageId = string(object(await draftResponse.json()).pageId);
    const draftRoute = pagesRoute + '/' + pageId;
    const read = 'cms.pages.read';
    const update = 'cms.pages.update';
    const list = 'cms.pages.list';

    async function addAccount(key: string, actionIds: string[]):
    Promise<{ email: string; roleId: string; id: string }> {
      const access = object(await (await request(siteRoute + '/access', undefined, ownerCookie)).json());
      const role = { roleId: null, key, name: key, description: 'Draft access for browser verification', actorIds: [] };
      const created = await request(siteRoute + '/access', { revision: access.revision, actionIds, role }, ownerCookie);

      expect(created.status, await created.clone().text()).toBe(200);
      const { customRoles } = object(await created.json());
      const savedRole = Array.isArray(customRoles) && customRoles.map(object).find((item) => item.key === key);
      const roleId = string(object(savedRole).roleId);
      const email = key + '@example.test';
      const user = await request('/users', { email, password, roleId, siteId }, ownerCookie);

      expect(user.status).toBe(201);

      return { email, roleId, id: string(object(await user.json()).adminUserId) };
    }

    const editor = await addAccount('page-editor', [list, read, update]);
    const linkEditor = await addAccount('page-link-editor', [read, update]);
    const writer = await addAccount('page-writer', [update]);
    const reviewer = await addAccount('page-reviewer', [read]);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      async function openAs(email: string, route: string): Promise<Page> {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        await signInAdminBrowser(page, origin, email, password);
        await page.goto(origin + '/admin' + route);

        return page;
      }

      async function saveFromEditor(page: Page, previous: string, next: string): Promise<void> {
        const title = page.locator('#page-title');

        await expect.poll(() => title.inputValue()).toBe(previous);
        await title.fill(next);
        await page.getByRole('button', { name: 'Save draft', exact: true }).click();
        await page.getByText('Draft saved', { exact: true }).waitFor();
        await page.reload();
        await expect.poll(() => title.inputValue()).toBe(next);
      }

      const administrator = await openAs('user-1@example.test', siteRoute + '/settings');

      await administrator.getByRole('button', { name: 'Access', exact: true }).click();
      const roleSelect = administrator.getByRole('combobox', { name: 'Role', exact: true });
      const hint = administrator.getByText(
        'To edit pages in the admin interface, also grant draft read access in the appropriate scope.',
        { exact: true },
      );

      await roleSelect.selectOption(writer.roleId);
      await hint.waitFor();
      const readScope = administrator.getByRole('checkbox', { name: 'Read a draft page · All · Pages', exact: true });

      await readScope.check();
      await hint.waitFor({ state: 'hidden' });
      await readScope.uncheck();
      await hint.waitFor();
      await roleSelect.selectOption(editor.roleId);
      expect(await hint.count()).toBe(0);
      await roleSelect.selectOption(reviewer.roleId);
      expect(await hint.count()).toBe(0);

      const fullPage = await openAs(editor.email, draftRoute);

      await fullPage.getByRole('tree').waitFor();
      await saveFromEditor(fullPage, 'Permission draft', 'Saved by editor');

      const linkPage = await openAs(linkEditor.email, draftRoute);

      await saveFromEditor(linkPage, 'Saved by editor', 'Saved without tree');
      expect(await linkPage.getByRole('tree').count()).toBe(0);

      const reviewing = await openAs(reviewer.email, draftRoute);

      await expect.poll(() => reviewing.locator('#page-title').inputValue()).toBe('Saved without tree');
      expect(await reviewing.locator('#page-title').isDisabled()).toBe(true);
      expect(await reviewing.getByRole('button', { name: 'Save draft', exact: true }).count()).toBe(0);

      const blocked = await openAs(writer.email, draftRoute);

      await blocked.getByText('Ask a site administrator for draft read access to open this page.', { exact: true })
        .waitFor();
      expect(await blocked.locator('#page-title').count()).toBe(0);
      expect(await blocked.getByRole('tree').count()).toBe(0);
      expect(await blocked.getByRole('button', { name: 'Save draft', exact: true }).count()).toBe(0);
      const headers = { Origin: origin, 'X-Zarya-Admin': '1' };
      const draftApi = origin + '/api/admin' + draftRoute;
      const changedDraft = { title: 'Saved through API', contentMd: 'Writer text' };

      expect((await reviewing.request.post(draftApi, { headers, data: changedDraft })).status()).toBe(403);
      expect((await blocked.request.get(draftApi, { headers })).status()).toBe(403);
      expect((await blocked.request.get(origin + '/api/admin' + pagesRoute, { headers })).status()).toBe(403);
      const written = await blocked.request.post(draftApi, { headers, data: changedDraft });

      expect(written.status()).toBe(200);
      expect(await written.json()).toEqual({ saved: true });
      const saved = await request(draftRoute, undefined, ownerCookie);

      expect(await saved.json()).toMatchObject({ ...changedDraft, metaDescription: 'Private description' });

      const access = object(await (await request(siteRoute + '/access', undefined, ownerCookie)).json());
      const narrowed = await request(siteRoute + '/access', {
        revision: access.revision,
        actionIds: [update, read, 'cms.pages.create'],
        objectScopes: { [update]: ['all'], [read]: ['own'], 'cms.pages.create': ['own'] },
        role: {
          roleId: writer.roleId,
          key: 'page-writer',
          name: 'page-writer',
          description: 'Draft access for browser verification',
          actorIds: [writer.id],
        },
      }, ownerCookie);

      expect(narrowed.status).toBe(200);
      expect((await blocked.request.get(draftApi, { headers })).status()).toBe(404);
      const scopedWrite = await blocked.request.post(draftApi, {
        headers, data: { ...changedDraft, title: 'Saved with read limited to own drafts' },
      });

      expect(scopedWrite.status()).toBe(200);
      expect(await scopedWrite.json()).toEqual({ saved: true });

      const ownDraft = await blocked.request.post(origin + '/api/admin' + pagesRoute, {
        headers,
        data: {
          mark: 'OwnPermissionDraft',
          title: 'Owned draft',
          language: 'en',
          h1: 'Owned draft',
          contentMd: 'Own draft text',
          metaDescription: 'Own draft description',
        },
      });

      expect(ownDraft.status()).toBe(201);
      const ownPageId = string(object(await ownDraft.json()).pageId);
      const ownWrite = await blocked.request.post(origin + '/api/admin' + pagesRoute + '/' + ownPageId, {
        headers, data: { title: 'Updated own draft', contentMd: 'New own text' },
      });

      expect(ownWrite.status()).toBe(200);
      expect(await ownWrite.json()).toMatchObject({
        title: 'Updated own draft', metaDescription: 'Own draft description',
      });

      const latest = object(await (await request(siteRoute + '/access', undefined, ownerCookie)).json());
      const revoked = await request(siteRoute + '/access', {
        revision: latest.revision,
        actionIds: [update],
        role: {
          roleId: linkEditor.roleId,
          key: 'page-link-editor',
          name: 'page-link-editor',
          description: 'Draft access for browser verification',
          actorIds: [linkEditor.id],
        },
      }, ownerCookie);

      expect(revoked.status).toBe(200);
      await linkPage.locator('#page-title').fill('Saved after read was revoked');
      await linkPage.getByRole('button', { name: 'Save draft', exact: true }).click();
      await linkPage.getByText('Draft saved', { exact: true }).waitFor();
      await linkPage.locator('#page-title').waitFor({ state: 'detached' });
      expect(await (await request(draftRoute, undefined, ownerCookie)).json())
        .toMatchObject({ title: 'Saved after read was revoked' });
    } finally {
      await browser.close();
    }
  }));

it('explains page positioning with missing list access and moves with both grants', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'PositionGrants',
      name: 'Position grants',
      primaryDomain: 'position-grants.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const pagesRoute = siteRoute + '/pages';
    const accessRoute = siteRoute + '/access';

    async function createDraft(mark: string, title: string): Promise<string> {
      const created = await request(pagesRoute, { mark, title, language: 'en', contentMd: 'Synthetic draft' }, owner);

      expect(created.status).toBe(201);

      return string(object(await created.json()).pageId);
    }

    const parentId = await createDraft('PositionParent', 'Target parent');
    const childId = await createDraft('PositionChild', 'Page to move');
    const childRoute = pagesRoute + '/' + childId;
    const list = 'cms.pages.list';
    const position = 'cms.pages.set-position';
    const editing = ['cms.pages.read', 'cms.pages.update'];
    const role = { key: 'position-editor', name: 'Position editor', description: 'Synthetic positioning role' };
    const initialAccess = object(await (await request(accessRoute, undefined, owner)).json());
    const added = await request(accessRoute, {
      revision: initialAccess.revision,
      actionIds: [...editing, position],
      role: { ...role, roleId: null, actorIds: [] },
    }, owner);

    expect(added.status).toBe(200);
    const { customRoles } = object(await added.json());
    const storedRole = Array.isArray(customRoles) && customRoles.map(object).find((item) => item.key === role.key);
    const roleId = string(object(storedRole).roleId);
    const email = 'position-editor@example.test';
    const user = await request('/users', { email, password, siteId, roleId }, owner);

    expect(user.status).toBe(201);
    const actorId = string(object(await user.json()).adminUserId);

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());
      const changed = await request(accessRoute, {
        revision: access.revision, actionIds, role: { ...role, roleId, actorIds: [actorId] },
      }, owner);

      expect(changed.status).toBe(200);
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const administrator = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(administrator, origin, 'user-1@example.test', password);
      await administrator.goto(origin + '/admin' + siteRoute + '/settings');
      await administrator.getByRole('button', { name: 'Access', exact: true }).click();
      await administrator.getByRole('combobox', { name: 'Role', exact: true }).selectOption(roleId);
      const roleHint = administrator.getByText(
        'Grant list access for the pages to move and their possible parents.',
        { exact: true },
      );
      const positionGrant = administrator.getByRole('checkbox', { name: 'Change page position · All · Pages' });
      const ownList = administrator.getByRole('checkbox', { name: 'List pages · Own · Pages' });

      await roleHint.waitFor();
      await positionGrant.uncheck();
      await roleHint.waitFor({ state: 'hidden' });
      await positionGrant.check();
      await roleHint.waitFor();
      await ownList.check();
      await roleHint.waitFor({ state: 'hidden' });

      const editor = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const calls: string[] = [];

      await signInAdminBrowser(editor, origin, email, password);
      editor.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (pathname === '/api/admin' + pagesRoute || pathname.endsWith('/position')) {
          calls.push(pathname);
        }
      });
      await editor.goto(origin + '/admin' + childRoute);
      const title = editor.locator('#page-title');
      const hint = editor.getByText('To choose a parent or reorder pages in the tree, you need page list access.',
        { exact: true });

      await hint.waitFor();
      expect(await title.inputValue()).toBe('Page to move');
      expect(await editor.locator('#page-parent').count()).toBe(0);
      expect(await editor.getByRole('tree').count()).toBe(0);
      await editor.getByLabel('Interface language').selectOption('ru');
      await editor.getByText('Чтобы выбрать родителя или изменить порядок в дереве, нужен доступ к списку страниц.',
        { exact: true }).waitFor();
      await editor.getByLabel('Язык интерфейса').selectOption('en');
      expect(calls).toEqual([]);

      await editor.setViewportSize({ width: 1440, height: 900 });
      await grant([...editing, list]);
      await editor.reload();
      const tree = editor.getByRole('tree');
      const child = tree.locator('[data-page-id="' + childId + '"]');
      const dragChild = tree.locator('[data-tree-drag="' + childId + '"]');
      const dragParent = tree.locator('[data-tree-drag="' + parentId + '"]');

      await child.waitFor();
      expect(await tree.locator('._tree-move').count()).toBe(0);
      await dragChild.dragTo(dragParent);
      expect(calls.filter((call) => call.endsWith('/position'))).toEqual([]);
      expect(await hint.count()).toBe(0);
      expect(await editor.getByText('Move pages in the tree. URL and sort order are preserved.', { exact: true })
        .count()).toBe(0);

      await grant([...editing, list, position]);
      await editor.reload();
      await dragChild.dragTo(dragParent);
      await editor.getByRole('status').filter({ hasText: 'Page moved' }).waitFor();
      const stored = await request(childRoute, undefined, owner);

      expect(await stored.json()).toMatchObject({ parentPageId: parentId });
      await editor.reload();
      await expect.poll(() => editor.locator('#page-parent').inputValue()).toBe(parentId);
      expect(await hint.count()).toBe(0);
    } finally {
      await browser.close();
    }
  }));

it('saves drafts and reads published output with independent publication grants', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'DraftAccess',
      name: 'Draft access',
      primaryDomain: 'draft-access.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const created = await request(siteRoute + '/pages', {
      mark: 'LimitedDraft',
      title: 'Published draft',
      language: 'en',
      h1: 'Published draft',
      contentMd: 'Original public content',
    }, owner);

    expect(created.status).toBe(201);
    const draftRoute = siteRoute + '/pages/' + string(object(await created.json()).pageId);
    const publication = await request(draftRoute + '/publication', {
      templateId: 'ZaryaBasic', path: '/publication-grants/',
    }, owner);

    expect(publication.status, await publication.clone().text()).toBe(200);
    const email = 'limited-draft-editor@example.test';
    const newUser = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(newUser.status).toBe(201);
    const editing = ['cms.pages.read', 'cms.pages.update'];
    const output = ['cms.pages.read-published-markdown', 'cms.json-ld.read-published-page'];

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());
      const changed = await request(accessRoute, { revision: access.revision, actionIds }, owner);

      expect(changed.status).toBe(200);
    }

    await grant([...editing, ...output, 'cms.publication.site-options']);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const administrator = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(administrator, origin, 'user-1@example.test', password);
      await administrator.goto(origin + '/admin' + siteRoute + '/settings');
      await administrator.getByRole('button', { name: 'Access', exact: true }).click();
      const roleHint = administrator.getByText(
        'Grant page publication options to show publication settings and status in the editor.',
        { exact: true },
      );
      const roleOptions = administrator.getByRole('checkbox', { name: 'Read page publication options · All · Pages' });

      await roleHint.waitFor();
      await roleOptions.check();
      await roleHint.waitFor({ state: 'hidden' });
      await roleOptions.uncheck();
      await roleHint.waitFor();

      const editor = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const requested: string[] = [];

      await signInAdminBrowser(editor, origin, email, password);
      editor.on('request', (outgoing) => requested.push(new URL(outgoing.url()).pathname));
      await editor.goto(origin + '/admin' + draftRoute);
      const hint = editor.getByText(
        'You can save the draft. Ask for page publication access to see its settings and status.',
        { exact: true },
      );
      const publicStatus = editor.getByText('Published on the site', { exact: true });
      const title = editor.locator('#page-title');

      await hint.waitFor();
      await publicStatus.waitFor();
      expect(await editor.locator('#page-template, #page-path').count()).toBe(0);
      expect(await editor.locator('[data-editorial-field="rendering.requestCache"]').count()).toBe(0);
      expect(await editor.getByRole('button', { name: 'Save & publish', exact: true }).count()).toBe(0);
      await title.fill('Saved without publication settings');
      await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
      await editor.getByText('Draft saved', { exact: true }).waitFor();
      await editor.reload();
      await expect.poll(() => title.inputValue()).toBe('Saved without publication settings');

      const more = editor.getByRole('button', { name: 'More', exact: true });

      await more.click();
      await editor.getByRole('button', { name: 'View in MD', exact: true }).click();
      const markdown = editor.getByRole('dialog').filter({ hasText: 'Published Markdown' });

      await markdown.getByText(/Original public content/).waitFor();
      await markdown.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(requested).not.toContain('/api/admin' + draftRoute + '/publication');

      await grant([...editing, ...output]);
      await editor.reload();
      await hint.waitFor();
      expect(await publicStatus.count()).toBe(0);
      await more.click();
      await editor.getByRole('button', { name: 'Published JSON-LD', exact: true }).click();
      const jsonLd = editor.getByRole('dialog').filter({ hasText: 'Published JSON-LD' });

      await jsonLd.waitFor();
      await jsonLd.getByRole('button', { name: 'Cancel', exact: true }).click();

      await grant([...editing, 'cms.publication.page-options']);
      await editor.reload();
      await editor.locator('#page-template').waitFor();
      expect(await editor.locator('#page-path').inputValue()).toBe('/publication-grants/');
      expect(await hint.count()).toBe(0);
      await more.click();
      expect(await editor.getByRole('button', { name: 'View in MD', exact: true }).count()).toBe(0);
      expect(await editor.getByRole('button', { name: 'Published JSON-LD', exact: true }).count()).toBe(0);
    } finally {
      await browser.close();
    }
  }));

it('publishes only a saved draft when the editor has publishing but no draft write grant', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const createdSite = await request('/sites', {
      mark: 'SavedDraftPublisher',
      name: 'Saved draft publisher',
      primaryDomain: 'saved-draft-publisher.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(createdSite.status).toBe(201);
    const siteId = string(object(await createdSite.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const pagesRoute = siteRoute + '/pages';
    const accessRoute = siteRoute + '/access';

    async function seedPage(mark: string, cookie: string): Promise<string> {
      const draft = await request(pagesRoute, {
        mark, title: mark, language: 'en', h1: mark, contentMd: 'Initial page content',
      }, cookie);

      expect(draft.status).toBe(201);

      return pagesRoute + '/' + string(object(await draft.json()).pageId);
    }

    const ready = await seedPage('ReadyDraft', owner);
    const noAddress = await seedPage('UnassignedDraft', owner);
    const initial = await request(ready + '/publication', { templateId: 'ZaryaBasic', path: '/saved-draft/' }, owner);

    expect(initial.status).toBe(200);
    const edit = await request(ready, { title: 'Reviewed draft', contentMd: 'Reviewed draft text' }, owner);

    expect(edit.status).toBe(200);
    const email = 'saved-draft-publisher@example.test';
    const user = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(user.status).toBe(201);

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());
      const changed = await request(accessRoute, { revision: access.revision, actionIds }, owner);

      expect(changed.status).toBe(200);
    }

    await grant(['cms.pages.create']);
    const noTemplate = await seedPage('NoTemplate', await login(email));
    const publisher = ['cms.pages.read', 'cms.publication.publish-page'];

    await grant(publisher);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const writes: { path: string; body: unknown }[] = [];

      await signInAdminBrowser(page, origin, email, password);
      page.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (outgoing.method() === 'POST' && pathname.startsWith('/api/admin' + pagesRoute)) {
          writes.push({ path: pathname, body: outgoing.postDataJSON() });
        }
      });

      const publish = page.getByRole('button', { name: 'Publish saved draft', exact: true });

      await page.goto(origin + '/admin' + ready);
      await page.getByText('Request access to page publication options to check whether this draft is ready.',
        { exact: true }).waitFor();
      expect(await publish.count()).toBe(0);

      await grant([...publisher, 'cms.publication.page-options']);
      await page.goto(origin + '/admin' + noAddress);
      await page.getByText('Ask an editor to assign a public URL before publishing.', { exact: true }).waitFor();
      expect(await publish.count()).toBe(0);
      await page.goto(origin + '/admin' + noTemplate);
      await page.getByText('Ask an editor to assign a template before publishing.', { exact: true }).waitFor();
      expect(await publish.count()).toBe(0);
      expect(writes).toEqual([]);

      await page.goto(origin + '/admin' + ready);
      await page.getByText('The last saved draft will be published.', { exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Save draft', exact: true }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Save & publish', exact: true }).count()).toBe(0);
      await publish.click();
      await page.getByText('Page published', { exact: true }).waitFor();
      expect(writes).toEqual([{ path: '/api/admin' + ready + '/publication', body: {} }]);
      const released = await request(ready + '/markdown-published', undefined, owner);

      expect(released.status).toBe(200);
      expect(await released.text()).toContain('Reviewed draft text');

      const next = await request(ready, { title: 'Later draft', contentMd: 'Later draft text' }, owner);

      expect(next.status).toBe(200);
      await page.goto(origin + '/admin' + ready);
      await page.route('**/api/admin' + ready + '/publication', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fetch();
          await route.abort();
        } else {
          await route.continue();
        }
      });
      await publish.click();
      await page.getByText('Could not confirm publication. Reload the page and check its published state before trying '
        + 'again.', { exact: true }).waitFor();
      expect(await publish.isDisabled()).toBe(true);
      expect(writes).toHaveLength(2);
      const afterLostAck = await request(ready + '/markdown-published', undefined, owner);

      expect(afterLostAck.status).toBe(200);
      expect(await afterLostAck.text()).toContain('Later draft text');

      await page.unroute('**/api/admin' + ready + '/publication');
      await grant([...publisher, 'cms.publication.page-options', 'cms.pages.update']);
      await page.goto(origin + '/admin' + ready);
      await page.getByRole('button', { name: 'Save & publish', exact: true }).waitFor();
      expect(await publish.count()).toBe(0);
    } finally {
      await browser.close();
    }
  }));

it('shows URL metadata with no draft read and respects Own and Groups for editor links', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'ScopedMetadata',
      name: 'Scoped metadata',
      primaryDomain: 'scoped-metadata.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const pagesRoute = siteRoute + '/pages';
    const accessRoute = siteRoute + '/access';
    const email = 'scoped-metadata-editor@example.test';
    const user = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(user.status).toBe(201);
    const actorId = string(object(await user.json()).adminUserId);
    const initialAccess = object(await (await request(accessRoute, undefined, owner)).json());
    const createdGroup = await request(accessRoute, {
      revision: initialAccess.revision,
      actionIds: [],
      group: {
        groupId: null,
        key: 'metadata-editors',
        name: 'Metadata editors',
        description: 'Synthetic access group',
        actorIds: [actorId],
      },
    }, owner);

    expect(createdGroup.status).toBe(200);
    const access = object(await createdGroup.json());
    const group = Array.isArray(access.groups)
      && access.groups.map(object).find((item) => item.key === 'metadata-editors');
    const accessGroupId = string(object(group).groupId);
    const objectScopes = {
      'cms.pages.create': ['own'],
      'cms.pages.list': ['own', 'groups'],
      'cms.pages.read': ['own', 'groups'],
      'cms.publication.site-options': ['all'],
      'cms.urls.list': ['all'],
    };

    expect(await request(accessRoute, {
      revision: access.revision, actionIds: Object.keys(objectScopes), objectScopes,
    }, owner)).toHaveProperty('status', 200);

    async function createPage(mark: string, heading: string, cookie: string): Promise<string> {
      const created = await request(pagesRoute, { mark, title: heading, h1: heading, language: 'en', contentMd: '' },
        cookie);

      expect(created.status).toBe(201);

      return string(object(await created.json()).pageId);
    }

    const ownPage = await createPage('OwnedMetadata', 'Owned metadata', await login(email));
    const groupPage = await createPage('GroupMetadata', 'Group metadata', owner);
    const externalPage = await createPage('OtherMetadata', 'Other metadata', owner);

    expect(await request(accessRoute + '/object-group', {
      domain: 'pages', objectId: groupPage, accessGroupId,
    }, owner)).toHaveProperty('status', 200);
    const ownedOptions = await request(pagesRoute + '/' + ownPage + '/publication', undefined, owner);

    expect(ownedOptions.status).toBe(200);
    const ownedPath = string(object(await ownedOptions.json()).path);
    const readableRoutes = [[ownPage, ownedPath], [groupPage, '/group-metadata/']];

    for (const [pageId, path] of [...readableRoutes, [externalPage, '/other-metadata/']]) {
      const published = await request(pagesRoute + '/' + pageId + '/publication', { templateId: 'ZaryaBasic', path },
        owner);

      expect(published.status, await published.clone().text()).toBe(200);
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const administrator = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(administrator, origin, 'user-1@example.test', password);
      await administrator.goto(origin + '/admin' + siteRoute + '/settings');
      await administrator.getByRole('button', { name: 'Access', exact: true }).click();
      const warning = administrator.getByText(
        'This grant shows site-wide information, including pages outside Own or Groups.',
        { exact: true },
      );
      const optionsGrant = administrator.getByRole('checkbox', {
        name: 'Read site publication options · All · Publication',
      });

      await optionsGrant.waitFor();
      await expect.poll(() => warning.count()).toBe(2);
      await optionsGrant.uncheck();
      await expect.poll(() => warning.count()).toBe(1);

      const editor = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(editor, origin, email, password);
      await editor.goto(origin + '/admin' + siteRoute + '/urls');
      const workspace = editor.locator('#urls-workspace');
      const open = workspace.getByRole('link', { name: 'Open page in admin', exact: true });

      await editor.locator('[data-url-path="/other-metadata/"]').click();
      await workspace.getByText('Other metadata', { exact: true }).waitFor();
      await workspace.getByText('Ask for draft read access to open the linked page.', { exact: true }).waitFor();
      expect(await open.count()).toBe(0);
      const headers = { Origin: origin, 'X-Zarya-Admin': '1' };
      const api = origin + '/api/admin';
      const publication = await editor.request.get(api + siteRoute + '/publication', { headers });

      expect(publication.status()).toBe(200);
      expect(await publication.json()).toMatchObject({
        pageAvailability: expect.arrayContaining([
          { pageId: externalPage, assignedPath: '/other-metadata/', publicPath: '/other-metadata/' },
        ]),
      });
      expect((await editor.request.get(api + pagesRoute + '/' + externalPage, { headers })).status()).toBe(404);

      for (const [pageId, path] of readableRoutes) {
        await editor.locator('[data-url-path="' + path + '"]').click();
        await expect.poll(() => open.getAttribute('href')).toBe('/admin' + pagesRoute + '/' + pageId);
      }
      await open.click();
      await expect.poll(() => editor.locator('#page-title').inputValue()).toBe('Group metadata');

      const currentAccess = object(await (await request(accessRoute, undefined, owner)).json());
      const onlyList = await request(accessRoute, {
        revision: currentAccess.revision, actionIds: ['cms.urls.list'],
      }, owner);

      expect(onlyList.status).toBe(200);
      const reads: string[] = [];

      editor.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (pathname.startsWith('/api/admin' + pagesRoute + '/')) {
          reads.push(pathname);
        }
      });
      await editor.goto(origin + '/admin' + siteRoute + '/urls');
      await editor.locator('[data-url-path="/group-metadata/"]').click();
      await workspace.getByText('Group metadata', { exact: true }).waitFor();
      await workspace.getByRole('heading', { name: '/group-metadata/', exact: true }).waitFor();
      await workspace.locator('._url-facts').getByText('PUBLISHED', { exact: true }).waitFor();
      const needsRead = workspace.getByText('Ask for draft read access to open the linked page.', { exact: true });

      await needsRead.waitFor();
      expect(await open.count()).toBe(0);
      expect(reads).toEqual([]);
      expect((await editor.request.get(api + pagesRoute + '/' + groupPage, { headers })).status()).toBe(403);
      expect(await request(accessRoute, {
        revision: object(await onlyList.json()).revision, actionIds: ['cms.urls.list', 'cms.pages.read'],
      }, owner)).toHaveProperty('status', 200);
      await editor.reload();
      await editor.locator('[data-url-path="/group-metadata/"]').click();
      await open.waitFor();
      expect(await needsRead.count()).toBe(0);
      await open.click();
      await expect.poll(() => editor.locator('#page-title').inputValue()).toBe('Group metadata');
    } finally {
      await browser.close();
    }
  }));

it('keeps page TV values readable without granting TV writes', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const createdSite = await request('/sites', {
      mark: 'TvGrants',
      name: 'TV grants',
      primaryDomain: 'tv-grants.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(createdSite.status).toBe(201);
    const siteId = string(object(await createdSite.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const definition = {
      name: 'note',
      caption: 'Review note',
      description: 'A saved page value',
      kind: 'Text',
      templateIds: ['ZaryaBasic'],
      sortOrder: 100,
      required: false,
    };

    expect(await request(siteRoute + '/template-variables', { expectedVersion: '0', fields: [definition] }, owner))
      .toHaveProperty('status', 200);
    const created = await request(siteRoute + '/pages', {
      mark: 'TvDraft', title: 'TV draft', h1: 'TV draft', language: 'en', contentMd: 'Ordinary draft text',
    }, owner);

    expect(created.status).toBe(201);
    const draftRoute = siteRoute + '/pages/' + string(object(await created.json()).pageId);
    const fieldRoute = draftRoute + '/template-variables';

    expect(await request(draftRoute + '/publication', { templateId: 'ZaryaBasic', path: '/tv-draft/' }, owner))
      .toHaveProperty('status', 200);
    const detailResponse = await request(fieldRoute, undefined, owner);
    const detail = object(await detailResponse.json());
    const value = {
      templateId: 'ZaryaBasic',
      values: { note: 'Stored review note' },
      expectedUpdatedAt: detail.updatedAt,
      catalogVersion: object(detail.catalog).version,
      mediaVersion: detail.mediaVersion,
    };

    expect(detailResponse.status).toBe(200);
    expect(await request(fieldRoute, value, owner)).toHaveProperty('status', 200);
    const email = 'tv-readonly-editor@example.test';
    const user = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(user.status).toBe(201);
    const grants = ['cms.pages.read', 'cms.pages.update', 'cms.template-variables.list'];

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());
      const changed = await request(accessRoute, { revision: access.revision, actionIds }, owner);

      expect(changed.status).toBe(200);
    }

    await grant([...grants, 'cms.template-variables.read-page']);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const editor = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const tvWrites: string[] = [];

      await signInAdminBrowser(editor, origin, email, password);
      editor.on('request', (outgoing) => {
        if (outgoing.method() === 'POST' && new URL(outgoing.url()).pathname === '/api/admin' + fieldRoute) {
          tvWrites.push(outgoing.url());
        }
      });
      await editor.goto(origin + '/admin' + draftRoute);
      const tvTab = editor.getByRole('tab', { name: 'Template variables', exact: true });
      const note = editor.getByRole('textbox', { name: 'Review note', exact: true });
      const hint = editor.getByText(
        'These values are available to view. Ask for permission to save page TV values to change them.',
        { exact: true },
      );

      await tvTab.click();
      await hint.waitFor();
      expect(await note.inputValue()).toBe('Stored review note');
      expect(await note.getAttribute('readonly')).not.toBeNull();
      await note.press('End');
      await note.press('x');
      expect(await note.inputValue()).toBe('Stored review note');
      await editor.getByRole('tab', { name: 'Main', exact: true }).click();
      await editor.locator('#page-title').fill('Edited without TV write');
      await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
      await editor.getByText('Draft saved', { exact: true }).waitFor();
      expect(tvWrites).toEqual([]);
      expect(await (await request(fieldRoute, undefined, owner)).json())
        .toMatchObject({ values: { note: 'Stored review note' } });

      await grant([
        ...grants, 'cms.template-variables.read-page', 'cms.template-variables.save-page', 'cms.files.list',
      ]);
      await editor.goto(origin + '/admin' + draftRoute);
      await tvTab.click();
      expect(await hint.count()).toBe(0);
      await note.fill('Written by TV editor');
      await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
      await editor.getByText('Draft saved', { exact: true }).waitFor();
      expect(tvWrites).toHaveLength(1);
      expect(await (await request(fieldRoute, undefined, owner)).json())
        .toMatchObject({ values: { note: 'Written by TV editor' } });

      await grant(grants);
      await editor.goto(origin + '/admin' + draftRoute);
      await editor.locator('#page-title').waitFor();
      expect(await tvTab.count()).toBe(0);
    } finally {
      await browser.close();
    }
  }));

it('opens linked JSON-LD profiles for readers and gates profile writes separately', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'ProfileGrants',
      name: 'Profile grants',
      primaryDomain: 'profile-grants.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const catalogRoute = siteRoute + '/json-ld';
    const accessRoute = siteRoute + '/access';
    const current = object(await (await request(catalogRoute, undefined, owner)).json());
    const profile = {
      profileId: 'linked_article',
      name: 'Linked article profile',
      templateIds: ['ZaryaBasic'],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [{ property: 'headline', required: true, source: { kind: 'pageField', name: 'title' } }],
      }],
    };
    const created = await request(siteRoute + '/pages', {
      mark: 'ProfileDraft', title: 'Profile draft', language: 'en', contentMd: 'Structured content',
    }, owner);

    expect(created.status).toBe(201);
    const draftRoute = siteRoute + '/pages/' + string(object(await created.json()).pageId);

    expect(await request(draftRoute + '/publication', { templateId: 'ZaryaBasic', path: '/profile-draft/' }, owner))
      .toHaveProperty('status', 200);
    expect(await request(catalogRoute, {
      expectedVersion: current.version, profiles: [profile], objects: [],
    }, owner)).toHaveProperty('status', 200);

    const email = 'profile-reader@example.test';
    const user = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(user.status).toBe(201);
    const sourceReads = ['cms.pages.read', 'cms.templates.list', 'cms.templates.read'];

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner)).toHaveProperty('status', 200);
    }

    await grant([...sourceReads, 'cms.json-ld.list']);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const assignments = page.getByText('JSON-LD profiles and inputs', { exact: true });
      const opens = page.getByRole('link', { name: 'Linked article profile', exact: true });
      const name = page.getByRole('textbox', { name: 'Profile name', exact: true });
      const hint = page.getByText(
        'You can view this profile. Ask for permission to save JSON-LD to change it or its assignments.',
        { exact: true },
      );

      for (const route of [draftRoute, siteRoute + '/templates/ZaryaBasic']) {
        await page.goto(origin + '/admin' + route);
        await assignments.click();
        await opens.click();
        await hint.waitFor();
        expect(await name.inputValue()).toBe(profile.name);
        expect(await name.isDisabled()).toBe(true);
        expect(await page.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0);
        await page.reload();
        await hint.waitFor();
      }

      const publicationPath = origin + '/admin' + siteRoute + '/jsonLd?profile=linked_article';
      const forbidden = await page.request.post(origin + '/api/admin' + catalogRoute, {
        headers: { Origin: origin, 'X-Zarya-Admin': '1' },
        data: { expectedVersion: 'stale', profiles: [], objects: [] },
      });

      expect(forbidden.status()).toBe(403);
      await grant([...sourceReads, 'cms.json-ld.list', 'cms.json-ld.save']);
      await page.goto(publicationPath);
      await name.fill('Updated linked profile');
      expect(await hint.count()).toBe(0);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect.poll(async () => {
        const result = await request(catalogRoute, undefined, owner);

        return object(await result.json()).profiles;
      }).toMatchObject([{ name: 'Updated linked profile' }]);

      await grant(sourceReads);
      await page.goto(origin + '/admin' + draftRoute);
      await page.locator('#page-title').waitFor();
      expect(await assignments.count()).toBe(0);
    } finally {
      await browser.close();
    }
  }));

it('preserves Open Graph references and gates the chooser and private thumbnails separately', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'OpenGraphGrants',
      name: 'Open Graph grants',
      primaryDomain: 'og-grants.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const filesRoute = siteRoute + '/files';
    const publicOrigin = 'https://og-grants.example.test';
    const settings = object(await (await request(siteRoute + '/settings', undefined, owner)).json());

    expect(await request(siteRoute + '/settings', {
      expectedAddresses: settings.addresses, addresses: { publicOrigin, localOrigin: null },
    }, owner)).toHaveProperty('status', 200);

    const library = object(await (await request(filesRoute, undefined, owner)).json());

    await uploadFixturePng(origin, filesRoute, library.version, owner, 'cover.png');
    const ogImage = publicOrigin + '/assets/images/cover.png';
    const created = await request(siteRoute + '/pages', {
      mark: 'OgGrantsPage',
      title: 'Open Graph draft',
      language: 'en',
      contentMd: 'Draft text',
      ogImage,
    }, owner);

    expect(created.status).toBe(201);
    const draftRoute = siteRoute + '/pages/' + string(object(await created.json()).pageId);
    const email = 'og-grants-editor@example.test';
    const user = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(user.status).toBe(201);
    const editing = ['cms.pages.read', 'cms.pages.update', 'cms.site-settings.read'];

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());
      const saved = await request(accessRoute, { revision: access.revision, actionIds }, owner);

      expect(saved.status).toBe(200);
    }

    await grant(editing);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const privateReads: string[] = [];
      const fileRequests: string[] = [];

      await signInAdminBrowser(page, origin, email, password);
      page.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (pathname.startsWith('/api/admin' + filesRoute)) {
          fileRequests.push(pathname);

          if (pathname.endsWith('/content')) {
            privateReads.push(pathname);
          }
        }
      });
      await page.goto(origin + '/admin' + draftRoute);
      const openGraph = page.getByRole('tab', { name: 'Open Graph', exact: true });
      const chooser = page.getByRole('button', { name: 'Image for Open Graph', exact: true });
      const dialog = page.getByRole('dialog', { name: 'Image library', exact: true });

      await openGraph.click();
      const savedValue = page.getByRole('textbox', { name: 'Image for Open Graph', exact: true });

      await page.getByText('Ask for file list access to choose an image from the library.', { exact: true }).waitFor();
      expect(await savedValue.inputValue()).toBe(ogImage);
      expect(await savedValue.getAttribute('readonly')).not.toBeNull();
      expect(await chooser.count()).toBe(0);
      expect(fileRequests).toEqual([]);
      await page.getByRole('textbox', { name: 'Open Graph title', exact: true }).fill('Updated social title');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText('Draft saved', { exact: true }).waitFor();
      expect(await (await request(draftRoute, undefined, owner)).json()).toMatchObject({
        ogImage, ogTitle: 'Updated social title',
      });

      await grant([...editing, 'cms.files.list']);
      await page.goto(origin + '/admin' + draftRoute);
      await openGraph.click();
      await chooser.click();
      await dialog.getByRole('button', { name: 'cover.png', exact: true }).waitFor();
      expect(await dialog.locator('img').count()).toBe(0);
      expect(privateReads).toEqual([]);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await grant([...editing, 'cms.files.list', 'cms.files.read-content']);
      await page.reload();
      await openGraph.click();
      await chooser.click();
      await dialog.locator('img[src*="/content"]').first().waitFor();
      await expect.poll(() => privateReads.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, { media: true }));

it('keeps Markdown and JSON-LD previews in a readable page context', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'ContextualPreviews',
      name: 'Contextual previews',
      primaryDomain: 'contextual-previews.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const created = await request(siteRoute + '/pages', {
      mark: 'PreviewContext', title: 'Preview context', language: 'en', contentMd: 'Saved preview content',
    }, owner);

    expect(created.status).toBe(201);
    const draftRoute = siteRoute + '/pages/' + string(object(await created.json()).pageId);

    expect(await request(draftRoute + '/publication', { templateId: 'ZaryaBasic', path: '/preview-context/' }, owner))
      .toHaveProperty('status', 200);
    const email = 'preview-reader@example.test';
    const user = await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner);

    expect(user.status).toBe(201);
    const previews = ['cms.pages.preview-markdown', 'cms.json-ld.preview-page'];

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner)).toHaveProperty('status', 200);
    }

    await grant(previews);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const administrator = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(administrator, origin, 'user-1@example.test', password);
      await administrator.goto(origin + '/admin' + siteRoute + '/settings');
      await administrator.getByRole('button', { name: 'Access', exact: true }).click();
      const hint = administrator.getByText(
        'Grant draft read access to the pages that need this preview.',
        { exact: true },
      );
      const readGrant = administrator.getByRole('checkbox', { name: 'Read a draft page · All · Pages' });

      await readGrant.waitFor();
      await expect.poll(() => hint.count()).toBe(2);
      await readGrant.check();
      expect(await hint.count()).toBe(0);

      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const pageRequests: string[] = [];

      await signInAdminBrowser(page, origin, email, password);
      page.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (pathname.startsWith('/api/admin' + draftRoute)) {
          pageRequests.push(pathname);
        }
      });

      for (const action of previews) {
        await grant([action]);
        await page.goto(origin + '/admin' + draftRoute);
        await page.getByText('Your role currently has no workspace access for this site.', { exact: true }).waitFor();
        expect(await page.getByRole('button', { name: 'Pages', exact: true }).count()).toBe(0);
        expect(await page.locator('#page-title').count()).toBe(0);
      }
      expect(pageRequests).toEqual([]);

      await grant(['cms.pages.read', ...previews]);
      await page.goto(origin + '/admin' + draftRoute);
      const more = page.getByRole('button', { name: 'More', exact: true });

      await more.click();
      expect(await page.getByRole('link', { name: 'JSON-LD · Settings', exact: true }).count()).toBe(0);
      await page.getByRole('button', { name: 'View draft in MD', exact: true }).click();
      await page.getByRole('dialog').getByText(/Saved preview content/).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await more.click();
      await page.getByRole('button', { name: 'Saved draft JSON-LD', exact: true }).click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Saved draft JSON-LD', exact: true }).waitFor();
      expect(await page.getByRole('tree').count()).toBe(0);
      expect(pageRequests).toContain('/api/admin' + draftRoute + '/markdown-preview');
      expect(pageRequests).toContain('/api/admin' + draftRoute + '/json-ld-preview');
    } finally {
      await browser.close();
    }
  }));

it('saves template, chunk and snippet drafts separately from site publishing', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ base, connection, origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'SourcePublishing',
      name: 'Source publishing',
      primaryDomain: 'source-publishing.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const email = 'source-writer@example.test';
    const source = { html: '', css: '', browserTypeScript: null, parameters: [] };
    const snippet = {
      code: 'return "Published snippet content";',
      phases: ['Build'],
      output: { name: 'result', kind: 'String', required: true },
    };
    const snippetResponse = await request(siteRoute + '/snippets', {
      ...source, name: 'Published snippet', snippet,
    }, owner);

    expect(snippetResponse.status).toBe(201);
    const liveSnippet = object(await snippetResponse.json());
    const snippetKey = string(liveSnippet.key);
    const liveSnippetRoute = siteRoute + '/snippets/' + snippetKey;
    const template = await request(siteRoute + '/templates', {
      ...source,
      name: 'Published layout',
      html: '<!doctype html><html><head><title>Published source</title></head><body>'
        + '[[' + snippetKey + '? &as=`data`]]<p>[[+data]]</p></body></html>',
    }, owner);

    expect(template.status).toBe(201);
    const templateId = string(object(await template.json()).key);
    const draftPage = await request(siteRoute + '/pages', {
      mark: 'PublishedSourceContext', title: 'Existing public page', language: 'en', contentMd: 'Source context',
    }, owner);

    expect(draftPage.status).toBe(201);
    const pageId = string(object(await draftPage.json()).pageId);

    expect(await request(siteRoute + '/pages/' + pageId + '/publication', {
      templateId, path: '/existing-public-page/',
    }, owner)).toHaveProperty('status', 200);

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const sections = ['templates', 'chunks', 'snippets'];
    const draftActions = sections.flatMap((section) =>
      ['list', 'read', 'create', 'update'].map((action) => 'cms.' + section + '.' + action));

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner))
        .toHaveProperty('status', 200);
    }

    await grant(draftActions);
    const manager = await login(email);

    expect(await request(siteRoute + '/publish', {}, manager)).toHaveProperty('status', 403);
    const releases = connection.collection('publication_releases');
    const initialReleaseCount = await releases.countDocuments({ siteId });
    const readPublic = (): Promise<string> =>
      getFixturePublicHtml(base, 'source-publishing.example.test', '/existing-public-page/');

    expect(await readPublic()).toContain('Published snippet content');
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const publishRequests: string[] = [];

      await signInAdminBrowser(page, origin, email, password);
      page.on('request', (outgoing) => {
        if (
          outgoing.method() === 'POST'
          && new URL(outgoing.url()).pathname === '/api/admin' + siteRoute + '/publish'
        ) {
          publishRequests.push(outgoing.url());
        }
      });

      const name = page.getByRole('textbox', { name: 'Element name', exact: true });
      const draft = page.getByRole('button', { name: 'Save draft', exact: true });
      const apply = page.getByRole('button', { name: 'Save & apply', exact: true });
      const confirmation = page.getByText(
        'Draft saved. Ask a site administrator with site publishing access to apply the changes.',
        { exact: true },
      );
      const sourceRoutes: string[] = [];

      for (const section of sections) {
        const sectionRoute = siteRoute + '/' + section;

        await page.goto(origin + '/admin' + sectionRoute + '/-/new');
        await name.fill('New ' + section);
        expect(await apply.count()).toBe(0);
        expect(await draft.getAttribute('class')).toBe('cms-primary');
        const created = page.waitForResponse((response) => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/admin' + sectionRoute);

        await draft.click();
        const result = await created;

        expect(result.status()).toBe(201);
        const key = string(object(await result.json()).key);
        const sourceRoute = sectionRoute + '/' + key;

        expect(key).not.toBe('');
        sourceRoutes.push(sourceRoute);
        await page.waitForURL(origin + '/admin' + sourceRoute);
        await confirmation.waitFor();
        await name.fill('Updated ' + section);
        await draft.click();
        await confirmation.waitFor();
        await page.reload();
        await expect.poll(() => name.inputValue()).toBe('Updated ' + section);
      }
      await page.goto(origin + '/admin' + liveSnippetRoute);
      const serverSource = page.getByRole('textbox', { name: 'Server TypeScript', exact: true });

      await serverSource.fill('return "Delegated draft content";');
      await draft.click();
      await confirmation.waitFor();
      expect(await readPublic()).toContain('Published snippet content');
      const current = object(await (await request(liveSnippetRoute, undefined, manager)).json());

      expect(object(current.snippet).code).toBe('return "Delegated draft content";');
      expect(await request(liveSnippetRoute, {
        ...source,
        name: 'Published snippet',
        expectedVersion: current.version,
        draftOnly: false,
        snippet: { ...snippet, code: 'return "Delegated API content";' },
      }, manager)).toHaveProperty('status', 200);
      expect(await readPublic()).toContain('Published snippet content');
      expect(publishRequests).toEqual([]);
      expect(await releases.countDocuments({ siteId })).toBe(initialReleaseCount);

      await grant([...draftActions, 'cms.publication.publish-site']);
      await page.goto(origin + '/admin' + liveSnippetRoute);
      await serverSource.fill('return "Privileged draft content";');
      await draft.click();
      await page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
      expect(await readPublic()).toContain('Published snippet content');
      expect(await releases.countDocuments({ siteId })).toBe(initialReleaseCount);

      for (const [index, sourceRoute] of sourceRoutes.entries()) {
        await page.goto(origin + '/admin' + sourceRoute);
        await apply.waitFor();
        await page.getByText(/Save & apply saves this element and publishes the entire site/).waitFor();
        await name.fill('Applied ' + sections[index]);
        await apply.click();
        await page.getByText('Changes saved and applied. Site published.', { exact: true }).waitFor();
        expect(await confirmation.count()).toBe(0);
      }
      expect(publishRequests).toHaveLength(3);
      expect(await releases.countDocuments({ siteId })).toBe(initialReleaseCount + 3);
      expect(await readPublic()).toContain('Privileged draft content');
    } finally {
      await browser.close();
    }
  }));

it('previews rendering sources with result access and a readable using page', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'SourcePreviews',
      name: 'Source previews',
      primaryDomain: 'source-previews.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const email = 'source-previewer@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const editor = await login(email);
    const sections = ['templates', 'chunks', 'snippets'];
    const readSources = sections.map((section) => 'cms.' + section + '.read');
    const generatePreviews = sections.map((section) => 'cms.' + section + '.preview');
    const resultAccess = 'cms.rendering-previews.read';
    const pageAccess = 'cms.pages.read';

    async function grant(actionIds: readonly string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, {
        revision: access.revision,
        actionIds,
        objectScopes: actionIds.includes(pageAccess) ? { [pageAccess]: ['own'] } : {},
      }, owner)).toHaveProperty('status', 200);
    }

    const source = { html: '', css: '', browserTypeScript: null, parameters: [] };

    async function createSource(section: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
      const created = await request(siteRoute + '/' + section, { ...source, ...payload }, owner);

      expect(created.status).toBe(201);

      return object(await created.json());
    }

    const snippet = await createSource('snippets', {
      name: 'Preview snippet',
      snippet: {
        code: 'return "Preview snippet output";',
        phases: ['Build'],
        output: { name: 'result', kind: 'String', required: true },
      },
    });
    const chunk = await createSource('chunks', { name: 'Preview chunk', html: '<aside>Preview chunk output</aside>' });
    const template = await createSource('templates', {
      name: 'Preview layout',
      html: '<!doctype html><html><head><title>Preview layout</title></head><body>[[*contentMd:markdown]]'
        + '[[$' + string(chunk.key) + ']][[' + string(snippet.key) + '? &as=`value`]]<p>[[+value]]</p></body></html>',
    });

    async function createPage(mark: string, title: string, cookie: string): Promise<string> {
      const created = await request(siteRoute + '/pages', {
        mark, title, h1: title, language: 'en', contentMd: title,
      }, cookie);

      expect(created.status, await created.clone().text()).toBe(201);
      const pageId = string(object(await created.json()).pageId);
      const published = await request(siteRoute + '/pages/' + pageId + '/publication', {
        templateId: template.key, path: '/' + title.toLowerCase().replaceAll(' ', '-') + '/',
      }, owner);

      expect(published.status, await published.text()).toBe(200);

      return pageId;
    }

    await grant(['cms.pages.create', 'cms.urls.materialize']);
    const ownPage = await createPage('OwnedContext', 'Owned preview context', editor);
    const otherPage = await createPage('OtherContext', 'Other user preview context', owner);
    const sources = [template, chunk, snippet].map((element, index) => ({
      route: siteRoute + '/' + sections[index] + '/' + string(element.key),
      version: string(element.version),
    }));
    const grants = [...readSources, ...generatePreviews];
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const select = page.getByLabel('Page for preview', { exact: true });
      const preview = page.getByRole('button', { name: 'Preview', exact: true });
      const frame = page.locator('.source-preview iframe');
      const resultHint = page.getByText('To open a preview, request access to the generated preview.', { exact: true });
      const pageHint = page.getByText('To preview this source, you need access to a page that uses it.', {
        exact: true,
      });
      const previewAddresses: string[] = [];

      for (const [rights, hint] of [
        [[...grants, pageAccess], resultHint],
        [[...grants, resultAccess], pageHint],
      ] as const) {
        await grant(rights);

        for (const { route } of sources) {
          await page.goto(origin + '/admin' + route);
          await hint.waitFor();
          expect(await select.count()).toBe(0);
          expect(await preview.count()).toBe(0);
          expect(await frame.count()).toBe(0);
        }
      }

      await grant([...grants, resultAccess, pageAccess]);

      for (const { route, version } of sources) {
        expect(await request(route + '/preview', { pageId: otherPage, expectedVersion: version }, editor))
          .toHaveProperty('status', 403);
        await page.goto(origin + '/admin' + route);
        await select.selectOption(ownPage);
        expect(await select.locator('option').allTextContents()).toEqual(['Select a page', 'Owned preview context']);
        await preview.click();
        const document = page.frameLocator('.source-preview iframe');

        await document.getByText('Owned preview context', { exact: true }).waitFor();
        await document.getByText('Preview chunk output', { exact: true }).waitFor();
        await document.getByText('Preview snippet output', { exact: true }).waitFor();
        previewAddresses.push((await frame.getAttribute('src'))!);
      }

      await grant([...readSources, resultAccess, pageAccess]);
      await page.goto(origin + '/admin' + sources[0]!.route);
      await page.getByRole('textbox', { name: 'Element name', exact: true }).waitFor();
      expect(await preview.count()).toBe(0);
      expect(await select.count()).toBe(0);
      expect(await frame.count()).toBe(0);

      const latest = previewAddresses.at(-1)!.slice('/api/admin'.length);

      expect(await request(latest, undefined, editor)).toHaveProperty('status', 200);
      expect(await request(latest, undefined, owner)).toHaveProperty('status', 404);
      await grant([...grants, resultAccess]);
      expect(await request(latest, undefined, editor)).toHaveProperty('status', 403);
      await grant([...grants, pageAccess]);
      expect(await request(latest, undefined, editor)).toHaveProperty('status', 403);
    } finally {
      await browser.close();
    }
  }));

it('links each source usage only when the actor can read its target', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'SourceUsageLinks',
      name: 'Source usages',
      primaryDomain: 'source-usages.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const email = 'source-usage-reader@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const editor = await login(email);
    const chunkRead = 'cms.chunks.read';

    async function grant(actionIds: string[], chunkScope = 'own'): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, {
        revision: access.revision,
        actionIds,
        objectScopes: actionIds.includes(chunkRead)
          ? { [chunkRead]: [chunkScope] } : {},
      }, owner)).toHaveProperty('status', 200);
    }

    const source = { html: '', css: '', browserTypeScript: null, parameters: [] };

    async function createSource(section: string, payload: Record<string, unknown>, cookie = owner): Promise<string> {
      const response = await request(siteRoute + '/' + section, { ...source, ...payload }, cookie);

      expect(response.status).toBe(201);

      return string(object(await response.json()).key);
    }

    const snippet = await createSource('snippets', {
      name: 'Shared snippet',
      snippet: {
        code: 'return "Shared usage";',
        phases: ['Build'],
        output: { name: 'result', kind: 'String', required: true },
      },
    });

    await grant(['cms.chunks.create']);
    const html = '[[' + snippet + '? &as=`value`]]<p>[[+value]]</p>';
    const ownChunk = await createSource('chunks', { name: 'Owned chunk', html }, editor);
    const otherChunk = await createSource('chunks', { name: 'Other chunk', html });
    const template = await createSource('templates', {
      name: 'Using template',
      html: '<!doctype html><html><head><title>Using template</title></head><body>'
        + '[[$' + ownChunk + ']][[$' + otherChunk + ']]</body></html>',
    });
    const draft = await request(siteRoute + '/pages', {
      mark: 'UsingPage', title: 'Using page', language: 'en', contentMd: 'Published example',
    }, owner);

    expect(draft.status).toBe(201);
    const pageId = string(object(await draft.json()).pageId);

    expect(await request(siteRoute + '/pages/' + pageId + '/publication', {
      path: '/using-page/', templateId: template,
    }, owner)).toHaveProperty('status', 200);
    const usageRoute = siteRoute + '/snippets/' + snippet;
    const ownRoute = siteRoute + '/chunks/' + ownChunk;
    const otherRoutes = [
      ['Other chunk', siteRoute + '/chunks/' + otherChunk],
      ['Using template', siteRoute + '/templates/' + template],
      ['Using page', siteRoute + '/pages/' + pageId],
    ] as const;
    const readSnippet = 'cms.snippets.read';

    await grant([readSnippet, chunkRead]);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const usages = page.locator('details.element-usages');
      const hint = usages.getByText('To open a listed item, request read access to it.', { exact: true });
      const route = origin + '/admin' + usageRoute;

      await page.goto(route);
      await usages.getByText('Where used', { exact: true }).click();
      await hint.waitFor();
      expect(await hint.count()).toBe(1);

      for (const [title, targetRoute] of otherRoutes) {
        await usages.getByText(title, { exact: true }).waitFor();
        expect(await usages.getByRole('link', { name: title, exact: true }).count()).toBe(0);
        expect([403, 404]).toContain((await request(targetRoute, undefined, editor)).status);
      }
      const ownLink = usages.getByRole('link', { name: 'Owned chunk', exact: true });

      expect(await ownLink.getAttribute('href')).toBe('/admin' + ownRoute);
      await ownLink.click();
      await page.waitForURL(origin + '/admin' + ownRoute);
      await page.getByRole('textbox', { name: 'Element name', exact: true }).waitFor();

      await grant([readSnippet, chunkRead, 'cms.templates.read', 'cms.pages.read'], 'all');

      for (const [title, targetRoute] of otherRoutes) {
        await page.goto(route);
        await usages.getByText('Where used', { exact: true }).click();
        expect(await hint.count()).toBe(0);
        const link = usages.getByRole('link', { name: title, exact: true });

        expect(await link.getAttribute('href')).toBe('/admin' + targetRoute);
        await link.click();
        await page.waitForURL(origin + '/admin' + targetRoute);
        await (title === 'Using page' ? page.locator('#page-title')
          : page.getByRole('textbox', { name: 'Element name', exact: true })).waitFor();
      }
    } finally {
      await browser.close();
    }
  }));

it('guides file and folder writers who lack the library list', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'LibraryWriteRights',
      name: 'Library write rights',
      primaryDomain: 'library-write-rights.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const filesRoute = siteRoute + '/files';
    const filesEndpoint = '/api/admin' + filesRoute;
    const email = 'media-writer@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const writer = await login(email);
    const upload = 'cms.files.upload';
    const createFolder = 'cms.files.create-folder';
    const listFiles = 'cms.files.list';
    const uploadHint = 'To upload a file, request access to the file list.';
    const folderHint = 'To create a folder, request access to the file list.';

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner)).toHaveProperty('status', 200);
    }

    await grant([upload, createFolder]);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const administrator = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(administrator, origin, 'user-1@example.test', password);
      await administrator.goto(origin + '/admin' + siteRoute + '/settings');
      await administrator.getByRole('button', { name: 'Access', exact: true }).click();
      const roleUploadHint = administrator.getByText(uploadHint, { exact: true });
      const roleFolderHint = administrator.getByText(folderHint, { exact: true });

      await roleUploadHint.waitFor();
      await roleFolderHint.waitFor();
      await administrator.getByRole('checkbox', { name: 'Read the media library · All · Files' }).check();
      expect(await roleUploadHint.count()).toBe(0);
      expect(await roleFolderHint.count()).toBe(0);

      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

      await signInAdminBrowser(page, origin, email, password);
      const libraryRequests: string[] = [];

      page.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (pathname === filesEndpoint || pathname.startsWith(filesEndpoint + '/')) {
          libraryRequests.push(outgoing.method());
        }
      });
      const uploadHelp = page.getByText(uploadHint, { exact: true });
      const folderHelp = page.getByText(folderHint, { exact: true });
      const folderButton = page.getByRole('button', { name: 'Create folder', exact: true });
      const fileInput = page.locator('input[type=file]');

      await page.goto(origin + '/admin' + filesRoute);
      await page.getByText('To upload a file or create a folder, request access to the file list.', { exact: true })
        .waitFor();

      for (const action of [upload, createFolder]) {
        await grant([action]);
        await page.goto(origin + '/admin' + filesRoute);
        await page.getByRole('main', { name: 'Files', exact: true }).waitFor();
        await (action === upload ? uploadHelp : folderHelp).waitFor();
        expect(await (action === upload ? folderHelp : uploadHelp).count()).toBe(0);
        expect(await page.getByRole('complementary', { name: 'File tree', exact: true }).count()).toBe(0);
        expect(await folderButton.count()).toBe(0);
        expect(await fileInput.count()).toBe(0);
        expect(await request(filesRoute, undefined, writer)).toHaveProperty('status', 403);
      }
      expect(libraryRequests).toEqual([]);

      await grant([upload, createFolder, listFiles]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(origin + '/admin' + filesRoute);
      expect(await uploadHelp.count()).toBe(0);
      expect(await folderHelp.count()).toBe(0);
      await page.getByRole('complementary', { name: 'File tree', exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'New folder name', exact: true }).fill('Role uploads');
      const folderResponse = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname === filesEndpoint + '/folders');

      await folderButton.click();
      const folderResult = await folderResponse;

      expect(folderResult.ok()).toBe(true);
      const version = string(object(await folderResult.json()).version);
      const buffer = await sharp({
        create: { width: 32, height: 32, channels: 3, background: '#224477' },
      }).png().toBuffer();

      await fileInput.setInputFiles({ name: 'role-upload.png', mimeType: 'image/png', buffer });
      await page.locator('._file-upload-row').getByRole('combobox').selectOption('Original');
      const uploadResponse = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname === filesEndpoint);

      await page.getByRole('button', { name: 'Upload images', exact: true }).click();
      const uploadResult = await uploadResponse;

      expect(uploadResult.ok()).toBe(true);
      const metadata = uploadResult.request().headers()['x-zarya-file-metadata'] ?? '';

      expect(JSON.parse(decodeURIComponent(metadata))).toMatchObject({ expectedVersion: version, folderId: null });
      const catalog = object(await (await request(filesRoute, undefined, owner)).json());

      expect(catalog.folders).toEqual([expect.objectContaining({ name: 'Role uploads' })]);
      expect(catalog.files).toEqual([expect.objectContaining({ name: 'role-upload.png' })]);
    } finally {
      await browser.close();
    }
  }, { media: true }));

it('requires reference review before moving or deleting files in the browser', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'FileReferenceRights',
      name: 'File reference rights',
      primaryDomain: 'file-reference-rights.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const accessRoute = siteRoute + '/access';
    const filesRoute = siteRoute + '/files';
    const library = object(await (await request(filesRoute, undefined, owner)).json());
    const uploaded = await uploadFixturePng(origin, filesRoute, library.version, owner, 'guarded.png');
    const file = Array.isArray(uploaded.files) ? object(uploaded.files[0]) : {};
    const fileRoute = filesRoute + '/' + string(file.fileId);
    const folder = await request(filesRoute + '/folders', {
      expectedVersion: uploaded.version, name: 'Review folder', parentId: null, root: 'images',
    }, owner);

    expect(folder.status).toBe(200);
    const currentVersion = string(object(await folder.json()).version);

    expect(await request(siteRoute + '/pages', {
      mark: 'FileConsumer',
      title: 'Using this file',
      language: 'en',
      contentMd: '<img src="/assets/images/guarded.png" width="32" height="32">',
    }, owner)).toHaveProperty('status', 201);

    const email = 'media-operator@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const actor = await login(email);
    const move = 'cms.files.move';
    const remove = 'cms.files.delete';
    const review = 'cms.files.usages';

    async function grant(actionIds: readonly string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, {
        revision: access.revision, actionIds: ['cms.files.list', ...actionIds],
      }, owner)).toHaveProperty('status', 200);
    }

    await grant([move, remove]);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(admin, origin, 'user-1@example.test', password);
      await admin.goto(origin + '/admin' + siteRoute + '/settings');
      await admin.getByRole('button', { name: 'Access', exact: true }).click();
      const roleHints = admin.getByText(/request access to check where it is used/);

      await expect.poll(() => roleHints.count()).toBe(2);
      await admin.getByRole('checkbox', { name: 'Read media usages · All · Files' }).check();
      expect(await roleHints.count()).toBe(0);

      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const tree = page.getByRole('complementary', { name: 'File tree', exact: true });
      const draggable = tree.getByRole('button', { name: 'guarded.png', exact: true });
      const target = tree.getByRole('button', { name: 'Review folder', exact: true });
      const rename = page.getByRole('button', { name: 'Rename file: guarded.png', exact: true });
      const deleteButton = page.getByRole('button', { name: 'Delete image', exact: true });
      const forceDelete = page.getByRole('button', { name: 'Force delete', exact: true });
      const changeRequests: string[] = [];

      page.on('request', (outgoing) => {
        const pathname = new URL(outgoing.url()).pathname;

        if (pathname.startsWith('/api/admin' + fileRoute + '/')) {
          changeRequests.push(pathname.split('/').at(-1)!);
        }
      });
      const route = origin + '/admin' + fileRoute;
      const moveHint = 'To rename or move this file, request access to check where it is used.';
      const deleteHint = 'To delete this file, request access to check where it is used.';
      const changeHint = 'To rename, move or delete this file, request access to check where it is used.';

      for (const [rights, expected] of [[[], undefined], [[move], moveHint],
        [[remove], deleteHint], [[move, remove], changeHint]] as const) {
        await grant(rights);
        await page.goto(route);
        await page.getByRole('heading', { name: 'guarded.png', exact: true }).waitFor();
        await page.getByText(/image\/png.*32 × 32/).waitFor();

        if (expected) {
          await page.getByText(expected, { exact: true }).waitFor();
        }
        expect(await page.getByText(/request access to check where it is used/).count()).toBe(expected ? 1 : 0);
        expect(await rename.count()).toBe(0);
        expect(await page.getByLabel('File name', { exact: true }).count()).toBe(0);
        expect(await page.getByLabel('Folder', { exact: true }).count()).toBe(0);
        expect(await deleteButton.count()).toBe(0);
        expect(await forceDelete.count()).toBe(0);
        expect(await draggable.getAttribute('draggable')).toBe('false');
      }
      await draggable.dragTo(target);
      expect(changeRequests).toEqual([]);
      expect(await request(fileRoute + '/usages?expectedVersion=' + currentVersion, undefined, actor))
        .toHaveProperty('status', 403);

      await grant([move, remove, review]);
      await page.goto(route);
      await rename.waitFor();
      expect(await page.getByText(changeHint, { exact: true }).count()).toBe(0);
      expect(await draggable.getAttribute('draggable')).toBe('true');
      await page.getByLabel('File name', { exact: true }).waitFor();
      await page.locator('._file-organization').getByRole('combobox').waitFor();
      await draggable.dragTo(target);
      const dialog = page.getByRole('dialog', { name: 'Change file address', exact: true });

      await dialog.getByRole('listitem').filter({ hasText: 'Using this file' }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(changeRequests).toContain('usages');
      expect(changeRequests).not.toContain('move');
      await deleteButton.click();
      await forceDelete.waitFor();
      expect(changeRequests).not.toContain('delete');
      await forceDelete.click();
      await page.waitForURL(origin + '/admin' + filesRoute);
      expect(changeRequests).toContain('delete');
      expect(object(await (await request(filesRoute, undefined, owner)).json()).files).toEqual([]);
    } finally {
      await browser.close();
    }
  }, { media: true }));

it('explains and applies file address changes without publishing unrelated drafts', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ base, connection, origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const host = 'file-move-effect.example.test';
    const site = await request('/sites', {
      mark: 'FileMoveEffect', name: 'File move effect', primaryDomain: host, languages: ['en'], defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const filesRoute = siteRoute + '/files';
    const accessRoute = siteRoute + '/access';
    const catalog = object(await (await request(filesRoute, undefined, owner)).json());
    const uploaded = await uploadFixturePng(origin, filesRoute, catalog.version, owner, 'old-address.png');
    const file = Array.isArray(uploaded.files) ? object(uploaded.files[0]) : {};
    const fileRoute = filesRoute + '/' + string(file.fileId);
    const before = '/assets/images/old-address.png';
    const after = '/assets/images/new-address.png';
    const source = { html: '', css: '', browserTypeScript: null, parameters: [] };
    const snippet = {
      code: 'return "' + before + '#published-source";',
      phases: ['Build'],
      output: { name: 'result', kind: 'String', required: true },
    };
    const snippetResponse = await request(siteRoute + '/snippets', {
      ...source, name: 'Linked source', snippet,
    }, owner);

    expect(snippetResponse.status).toBe(201);
    const initialSnippet = object(await snippetResponse.json());
    const snippetRoute = siteRoute + '/snippets/' + string(initialSnippet.key);
    const template = await request(siteRoute + '/templates', {
      ...source,
      name: 'Media layout',
      html: '<!doctype html><html><head><title>Media layout</title></head><body>[[*contentMd:markdown]]'
        + '[[' + string(initialSnippet.key) + '? &as=`value`]]'
        + '<img src="[[+value]]" width="32" height="32" alt="Snippet"></body></html>',
    }, owner);

    expect(template.status).toBe(201);
    const templateId = string(object(await template.json()).key);
    const created = await request(siteRoute + '/pages', {
      mark: 'MediaConsumer',
      title: 'Media consumer',
      language: 'en',
      contentMd: 'Published copy\n\n<img src="' + before + '" width="32" height="32" alt="Published">',
    }, owner);

    expect(created.status).toBe(201);
    const pageRoute = siteRoute + '/pages/' + string(object(await created.json()).pageId);
    const publicPath = '/media-consumer/';
    const published = await request(pageRoute + '/publication', { templateId, path: publicPath }, owner);

    expect(published.status, await published.text()).toBe(200);
    expect(await request(pageRoute, {
      title: 'Media consumer',
      contentMd: 'Draft copy\n\n<img src="' + before + '" width="32" height="32" alt="Draft">',
    }, owner)).toHaveProperty('status', 200);
    expect(await request(snippetRoute, {
      ...source,
      name: 'Linked source',
      expectedVersion: initialSnippet.version,
      draftOnly: true,
      snippet: { ...snippet, code: 'return "' + before + '#draft-source";' },
    }, owner)).toHaveProperty('status', 200);
    const initialPublic = await getFixturePublicHtml(base, host, publicPath);

    expect(initialPublic).toContain(before + '#published-source');
    expect(initialPublic).toContain('Published copy');
    const releases = connection.collection('publication_releases');
    const earlier = await releases.find({ siteId }).toArray();
    const email = 'file-address-operator@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const actor = await login(email);
    const writeActions = ['cms.files.list', 'cms.files.move', 'cms.files.usages'];

    async function grant(actions: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds: actions }, owner))
        .toHaveProperty('status', 200);
    }

    await grant(writeActions);
    expect(await request(pageRoute, undefined, actor)).toHaveProperty('status', 403);
    expect(await request(siteRoute + '/publish', {}, actor)).toHaveProperty('status', 403);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(admin, origin, 'user-1@example.test', password);
      await admin.goto(origin + '/admin' + siteRoute + '/settings');
      await admin.getByRole('button', { name: 'Access', exact: true }).click();
      await admin.getByText('Moving a file can update links in drafts and on the active site.', { exact: true })
        .waitFor();

      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const usage = page.locator('section.file-usages');
      const dialog = page.getByRole('dialog', { name: 'Change file address', exact: true });
      const nameInput = page.locator('input._file-name-edit');
      const missingRead = 'To open a listed item, request read access to it.';

      async function openRename(): Promise<void> {
        await page.getByRole('button', { name: 'Rename file: old-address.png', exact: true }).click();
        await nameInput.fill('new-address.png');
        await nameInput.press('Enter');
        await dialog.waitFor();
      }

      await page.goto(origin + '/admin' + fileRoute);
      await usage.getByText(missingRead, { exact: true }).waitFor();
      expect(await usage.getByRole('link', { name: 'Media consumer', exact: true }).count()).toBe(0);
      await openRename();
      await dialog.getByText(before, { exact: true }).waitFor();
      await dialog.getByText(after, { exact: true }).waitFor();
      await dialog.getByText(/Saved historical versions keep their addresses/).waitFor();
      await dialog.getByText(missingRead, { exact: true }).waitFor();
      expect(await dialog.getByRole('link', { name: 'Media consumer', exact: true }).count()).toBe(0);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await getFixturePublicHtml(base, host, publicPath)).toBe(initialPublic);

      expect(await usage.getByRole('link', { name: 'Linked source', exact: true }).count()).toBe(0);
      await grant([...writeActions, 'cms.pages.read', 'cms.snippets.read']);
      await page.reload();
      await usage.getByRole('link', { name: 'Media consumer', exact: true }).first().waitFor();
      await openRename();
      const snippetLink = dialog.getByRole('link', { name: 'Linked source', exact: true }).first();

      expect(await snippetLink.getAttribute('href')).toBe('/admin' + snippetRoute);
      const pageLink = dialog.getByRole('link', { name: 'Media consumer', exact: true }).first();

      expect(await pageLink.getAttribute('href')).toBe('/admin' + pageRoute);
      await pageLink.click();
      await page.waitForURL(origin + '/admin' + pageRoute);
      await page.locator('#page-title').waitFor();
      expect(await dialog.count()).toBe(0);
      await page.goto(origin + '/admin' + fileRoute);
      await openRename();
      const moved = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/admin' + fileRoute + '/move');

      await dialog.getByRole('button', { name: 'Update links', exact: true }).click();
      const result = await moved;

      expect(result.status(), await result.text()).toBe(200);
      expect(result.request().postDataJSON()).toMatchObject({ updateReferences: true, name: 'new-address.png' });
      await page.getByRole('button', { name: 'Rename file: new-address.png', exact: true }).waitFor();
      const updatedDraft = object(await (await request(pageRoute, undefined, owner)).json());
      const updatedSnippet = object(await (await request(snippetRoute, undefined, owner)).json());
      const publicHtml = await getFixturePublicHtml(base, host, publicPath);

      expect(updatedDraft.contentMd).toContain('Draft copy');
      expect(updatedDraft.contentMd).toContain(after);
      expect(object(updatedSnippet.snippet).code).toContain(after + '#draft-source');
      expect(publicHtml).toContain('Published copy');
      expect(publicHtml).toContain(after + '#published-source');
      expect(publicHtml).not.toContain('draft-source');
      expect(publicHtml).not.toContain('Draft copy');
      expect(publicHtml).not.toContain(before);
      expect(await releases.countDocuments({ siteId })).toBe(earlier.length + 1);

      for (const retained of earlier) {
        expect(await releases.findOne({ _id: retained._id })).toEqual(retained);
      }
    } finally {
      await browser.close();
    }
  }, { media: true }));

it('shows file metadata without requesting bytes before the content grant', { timeout: 60000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'FileContentRights',
      name: 'File content rights',
      primaryDomain: 'file-content-rights.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const filesRoute = siteRoute + '/files';
    const accessRoute = siteRoute + '/access';
    const library = object(await (await request(filesRoute, undefined, owner)).json());
    const uploaded = await uploadFixturePng(
      origin, filesRoute, library.version, owner, 'private.png', 'Responsive', 1024,
    );
    const file = Array.isArray(uploaded.files) ? object(uploaded.files[0]) : {};
    const outputs = Array.isArray(file.outputs) ? file.outputs.map(object) : [];
    const output = outputs.find((candidate) => candidate.mimeType === 'image/webp');

    expect(output).toBeDefined();
    const fileRoute = filesRoute + '/' + string(file.fileId);
    const contentRoute = fileRoute + '/content';
    const variantKey = string(output?.key);
    const variantName = string(output?.url).split('/').at(-1)!;
    const email = 'file-metadata-reader@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const readContent = 'cms.files.read-content';

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, {
        revision: access.revision, actionIds: ['cms.files.list', ...actionIds],
      }, owner)).toHaveProperty('status', 200);
    }

    await grant([]);
    const actor = await login(email);

    expect(await request(contentRoute + '?key=original', undefined, actor)).toHaveProperty('status', 403);
    expect(await request(contentRoute + '?key=' + variantKey, undefined, actor)).toHaveProperty('status', 403);
    const original = await request(contentRoute + '?key=original', undefined, owner);

    expect(original.status).toBe(200);
    const bytes = Buffer.from(await original.arrayBuffer());
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const privateRequests: string[] = [];

      await signInAdminBrowser(page, origin, email, password);
      page.on('request', (outgoing) => {
        const url = new URL(outgoing.url());

        if (url.pathname === '/api/admin' + contentRoute) {
          privateRequests.push(url.searchParams.get('key') ?? '');
        }
      });
      const tree = page.getByRole('complementary', { name: 'File tree', exact: true });
      const row = tree.getByRole('button', { name: 'private.png', exact: true });
      const hint = page.getByText('To open or download this file, request access to file contents.', { exact: true });
      const downloadLink = page.getByRole('link', { name: 'Download original', exact: true });
      const variantLink = page.getByRole('link', { name: variantName, exact: true });
      const preview = page.locator('img._file-preview');

      await page.goto(origin + '/admin' + filesRoute);
      await row.waitFor();
      expect(await row.locator('svg').count()).toBeGreaterThan(0);
      await page.locator('.folder-contents').getByText(/image\/png/).waitFor();
      await row.click();
      await hint.waitFor();
      expect(await page.locator('._file-metadata').textContent()).toMatch(/image\/png\s*·\s*1024 × 1024/);
      await page.locator('.file-variants').getByText(variantName, { exact: false }).first().waitFor();
      expect(await preview.count()).toBe(0);
      expect(await downloadLink.count()).toBe(0);
      expect(await variantLink.count()).toBe(0);
      expect(privateRequests).toEqual([]);

      await grant([readContent]);
      await page.reload();
      await downloadLink.waitFor();
      await variantLink.waitFor();
      expect(await hint.count()).toBe(0);
      await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      expect(privateRequests.some((key) => key !== 'original')).toBe(true);

      const downloadEvent = page.waitForEvent('download');

      await downloadLink.click();
      const download = await downloadEvent;

      expect(download.suggestedFilename()).toBe('private.png');
      expect(await readFile(await download.path())).toEqual(bytes);
      const popup = page.context().waitForEvent('page');

      await variantLink.click();
      const opened = await popup;

      await opened.waitForURL('**' + contentRoute + '?key=' + variantKey);
      const response = await opened.request.get(opened.url());

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/webp');
      await opened.close();
    } finally {
      await browser.close();
    }
  }, { media: true }));

it('keeps existing route relationships editable without URL search', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'RouteEditingRights',
      name: 'Route editing rights',
      primaryDomain: 'route-editing-rights.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const urlsRoute = siteRoute + '/urls';
    const accessRoute = siteRoute + '/access';

    async function createPage(mark: string, at: string): Promise<string> {
      const created = await request(siteRoute + '/pages', {
        mark, title: mark, language: 'en', contentMd: 'Published route fixture',
      }, owner);

      expect(created.status).toBe(201);
      const id = string(object(await created.json()).pageId);

      expect(await request(siteRoute + '/pages/' + id + '/publication', {
        path: at, templateId: 'ZaryaBasic',
      }, owner)).toHaveProperty('status', 200);

      return id;
    }

    async function readUrl(at: string): Promise<Record<string, unknown>> {
      const response = await request(urlsRoute, undefined, owner);
      const catalog = object(await response.json());
      const rows = Array.isArray(catalog.urls) ? catalog.urls.map((item) => object(object(item).url)) : [];
      const url = rows.find((row) => row.path === at);

      expect(url, at).toBeDefined();

      return url!;
    }

    const parentPath = '/routes/';
    const oldPath = '/routes/before/';
    const newPath = '/routes/after/';
    const alternativePath = '/alternative/';

    await createPage('RouteParent', parentPath);
    const pageId = await createPage('RouteChild', oldPath);

    await createPage('Alternative', alternativePath);
    const parent = await readUrl(parentPath);
    const original = await readUrl(oldPath);
    const originalRoute = urlsRoute + '/' + string(original.urlId);

    expect(await request(originalRoute + '/move', {
      path: oldPath, pageId, parentUrlId: parent.urlId, moveSubtree: false, redirectStatus: 301,
    }, owner)).toHaveProperty('status', 200);

    const email = 'route-editor@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const writes = ['cms.urls.move', 'cms.urls.set-redirect'];

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, {
        revision: access.revision, actionIds: [...writes, ...actionIds],
      }, owner)).toHaveProperty('status', 200);
    }

    await grant([]);
    const actor = await login(email);

    expect(await request(urlsRoute, undefined, actor)).toHaveProperty('status', 403);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

      await signInAdminBrowser(page, origin, email, password);
      const catalogRequests: string[] = [];
      const suggestionRequests: string[] = [];

      page.on('request', (outgoing) => {
        const url = new URL(outgoing.url());

        if (url.pathname === '/api/admin' + urlsRoute) {
          catalogRequests.push(outgoing.method());
        }
        if (url.pathname === '/api/admin' + urlsRoute + '/suggestions') {
          suggestionRequests.push(url.searchParams.get('purpose') ?? '');
        }
      });

      const main = page.getByRole('main', { name: 'URLs', exact: true });
      const moveButton = main.getByRole('button', { name: 'Change URL', exact: true });
      const input = main.getByRole('textbox', { name: 'New URL path', exact: true });
      const parentLabel = 'Parent URL for routing relationships';
      const targetLabel = 'Destination address';
      const parentPicker = main.getByRole('button', { name: parentLabel, exact: true });
      const targetPicker = main.getByRole('button', { name: targetLabel, exact: true });
      const saveRedirect = main.getByRole('button', { name: 'Save redirect', exact: true });

      await page.goto(origin + '/admin' + originalRoute);
      await main.getByText('To choose a route, request access to the URLs catalog.', { exact: true }).waitFor();
      expect(await page.getByRole('complementary', { name: 'URL tree', exact: true }).count()).toBe(0);
      expect(await input.count()).toBe(0);
      expect(catalogRequests).toEqual([]);

      await grant(['cms.urls.list']);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(origin + '/admin' + originalRoute);
      const parentField = main.getByRole('textbox', { name: parentLabel, exact: true });

      await parentField.waitFor();
      expect(await parentField.inputValue()).toBe(parentPath);
      expect(await parentField.getAttribute('readonly')).not.toBeNull();
      expect(await parentPicker.count()).toBe(0);
      await main.getByText('To choose a different parent, request access to URL search.', { exact: true })
        .waitFor();
      expect(await moveButton.isDisabled()).toBe(true);
      await input.fill(newPath);
      const moveResponse = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/admin' + originalRoute + '/move');

      await moveButton.click();
      const moved = await moveResponse;

      expect(moved.status()).toBe(200);
      expect(moved.request().postDataJSON()).toMatchObject({ path: newPath, parentUrlId: parent.urlId });
      const newUrl = await readUrl(newPath);
      const newRoute = urlsRoute + '/' + string(newUrl.urlId);

      await page.waitForURL(origin + '/admin' + newRoute);
      expect(newUrl.parentUrlId).toBe(parent.urlId);
      await main.getByText('To choose a redirect destination, request access to URL search.', { exact: true })
        .waitFor();
      expect(await saveRedirect.count()).toBe(0);

      await page.goto(origin + '/admin' + originalRoute);
      const target = main.getByRole('textbox', { name: targetLabel, exact: true });

      await target.waitFor();
      expect(await target.inputValue()).toBe(newPath);
      expect(await target.getAttribute('readonly')).not.toBeNull();
      expect(await targetPicker.count()).toBe(0);
      expect(await saveRedirect.isDisabled()).toBe(true);
      await main.getByRole('combobox', { name: 'Permanent redirect status', exact: true }).selectOption('308');
      await saveRedirect.click();
      await main.getByText('Redirect applied to the site.', { exact: true }).waitFor();
      expect(await readUrl(oldPath)).toMatchObject({ redirectStatus: 308, redirectTargetUrlId: newUrl.urlId });
      expect(suggestionRequests).toEqual([]);

      await grant(['cms.urls.list', 'cms.urls.suggest']);
      await page.goto(origin + '/admin' + newRoute);
      await parentPicker.click();
      await page.getByRole('option', { name: parentPath, exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.goto(origin + '/admin' + originalRoute);
      await targetPicker.click();
      await page.getByRole('option', { name: alternativePath, exact: true }).click();
      await saveRedirect.click();
      await main.getByText('Redirect applied to the site.', { exact: true }).waitFor();
      const alternative = await readUrl(alternativePath);

      expect(await readUrl(oldPath)).toMatchObject({ redirectStatus: 308, redirectTargetUrlId: alternative.urlId });
      expect(suggestionRequests).toEqual(expect.arrayContaining(['Parent', 'Redirect']));
    } finally {
      await browser.close();
    }
  }));

it('explains pending saved routes and lets a routing publisher apply them without replay', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ app, origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'RoutePublishingRights',
      name: 'Route publishing rights',
      primaryDomain: 'route-publishing-rights.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const urlsRoute = siteRoute + '/urls';
    const accessRoute = siteRoute + '/access';
    const publish = 'cms.urls.publish';
    const writes = ['cms.urls.list', 'cms.urls.move', 'cms.urls.set-redirect'];
    const email = 'route-publisher@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner)).toHaveProperty('status', 200);
    }

    async function catalog(): Promise<Record<string, unknown>> {
      return object(await (await request(urlsRoute, undefined, owner)).json());
    }

    async function routeAt(at: string): Promise<string> {
      const state = await catalog();
      const rows = Array.isArray(state.urls) ? state.urls.map((item) => object(object(item).url)) : [];
      const url = rows.find((item) => item.path === at);

      expect(url, at).toBeDefined();

      return urlsRoute + '/' + string(url?.urlId);
    }

    await grant([publish]);
    const actor = await login(email);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const main = page.getByRole('main', { name: 'URLs', exact: true });
      const apply = main.getByRole('button', { name: 'Apply URL changes', exact: true });
      const writesSeen: string[] = [];

      page.on('request', (outgoing) => {
        const route = new URL(outgoing.url()).pathname;

        if (outgoing.method() === 'POST' && route.startsWith('/api/admin' + urlsRoute + '/')) {
          writesSeen.push(route.slice('/api/admin'.length));
        }
      });

      await page.goto(origin + '/admin' + urlsRoute);
      await apply.waitFor();
      const noActive = vi.spyOn(app.get<IReleaseActivationPort>(RELEASE_ACTIVATION), 'getActive')
        .mockResolvedValue(null);

      try {
        const response = page.waitForResponse((result) => result.request().method() === 'POST'
          && new URL(result.url()).pathname === '/api/admin' + urlsRoute + '/publish');

        await apply.click();
        const result = await response;

        expect(result.status(), await result.text()).toBe(200);
        expect(await result.json()).toEqual({ publication: null });
        await main.getByText('Publish site content before applying routes.', { exact: true }).waitFor();
      } finally {
        noActive.mockRestore();
      }

      const created = await request(siteRoute + '/pages', {
        mark: 'PublishedRoutes', title: 'Published routes', language: 'en', contentMd: 'Frozen content',
      }, owner);

      expect(created.status).toBe(201);
      const pageId = string(object(await created.json()).pageId);

      expect(await request(siteRoute + '/pages/' + pageId + '/publication', {
        templateId: 'ZaryaBasic', path: '/original/',
      }, owner)).toHaveProperty('status', 200);
      await grant(writes);
      expect(await request(urlsRoute + '/publish', {}, actor)).toHaveProperty('status', 403);

      async function move(from: string, to: string, expectedStatus: number): Promise<void> {
        await page.goto(origin + '/admin' + from);
        await main.getByRole('textbox', { name: 'New URL path', exact: true }).fill(to);
        const response = page.waitForResponse((value) => value.request().method() === 'POST'
          && new URL(value.url()).pathname === '/api/admin' + from + '/move');

        await main.getByRole('button', { name: 'Change URL', exact: true }).click();
        expect((await response).status()).toBe(expectedStatus);
      }

      await move(await routeAt('/original/'), '/applied/', 200);
      await main.getByText('Address changed on the site. The old address redirects to the new URL.', {
        exact: true,
      }).waitFor();
      expect(await apply.count()).toBe(0);
      const working = await routeAt('/applied/');
      const active = object((await catalog()).published);
      const stage = vi.spyOn(app.get<IPublicationStorePort>(PUBLICATION_STORE), 'stage')
        .mockRejectedValueOnce(new Error('Synthetic move publication failure'))
        .mockRejectedValueOnce(new Error('Synthetic redirect publication failure'));
      const needsPublisher = main.getByText(
        'Route saved. Ask a site administrator with routing publishing access to apply it.',
        { exact: true },
      );

      try {
        await move(working, '/pending/', 202);
        await needsPublisher.waitFor();
        expect(await apply.count()).toBe(0);
        const pending = await routeAt('/pending/');

        expect(object((await catalog()).published).releaseId).toBe(active.releaseId);
        await page.goto(origin + '/admin' + working);
        await main.getByRole('combobox', { name: 'Permanent redirect status', exact: true }).selectOption('308');
        const redirect = page.waitForResponse((response) => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/admin' + working + '/redirect');

        await main.getByRole('button', { name: 'Save redirect', exact: true }).click();
        expect((await redirect).status()).toBe(202);
        await needsPublisher.waitFor();
        expect(await apply.count()).toBe(0);
        expect(object((await catalog()).published).releaseId).toBe(active.releaseId);
        const history = async (): Promise<unknown> => (await request(working + '/history', undefined, owner)).json();
        const retainedHistory = await history();
        const requestCount = writesSeen.length;

        await grant([publish]);
        await page.goto(origin + '/admin' + urlsRoute);
        await apply.click();
        await main.getByText('URL changes applied to the site.', { exact: true }).waitFor();
        expect(writesSeen.slice(requestCount)).toEqual([urlsRoute + '/publish']);
        expect(await history()).toEqual(retainedHistory);
        expect(await routeAt('/pending/')).toBe(pending);
        const publicState = object((await catalog()).published);

        expect(publicState.releaseId).not.toBe(active.releaseId);
        expect(publicState.routes).toEqual(expect.arrayContaining([
          expect.objectContaining({ path: '/pending/', pageId }),
          expect.objectContaining({ path: '/applied/', status: 308, targetPath: '/pending/' }),
        ]));
      } finally {
        stage.mockRestore();
      }
    } finally {
      await browser.close();
    }
  }));

it('reads, saves and rebuilds primary site settings through independent grants', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ connection, origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'SettingsAccess',
      name: 'Settings access',
      primaryDomain: 'settings-access.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const settingsRoute = siteRoute + '/settings';
    const accessRoute = siteRoute + '/access';
    const initialAddress = 'https://settings-access.example.test';
    const savedAddress = 'https://public.settings-access.example.test';
    const unsavedAddress = 'https://unsaved.settings-access.example.test';

    async function addresses(): Promise<Record<string, unknown>> {
      return object(object(await (await request(settingsRoute, undefined, owner)).json()).addresses);
    }

    const initial = {
      expectedAddresses: await addresses(), addresses: { publicOrigin: initialAddress, localOrigin: null },
    };

    expect(await request(settingsRoute, initial, owner)).toHaveProperty('status', 200);
    const draft = await request(siteRoute + '/pages', {
      mark: 'SettingsContent', title: 'Settings content', contentMd: 'Published content', language: 'en',
    }, owner);

    expect(draft.status).toBe(201);
    const pageId = string(object(await draft.json()).pageId);

    expect(await request(siteRoute + '/pages/' + pageId + '/publication', {
      templateId: 'ZaryaBasic', path: '/settings-content/',
    }, owner)).toHaveProperty('status', 200);

    const email = 'settings-reader@example.test';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);
    const read = 'cms.site-settings.read';
    const update = 'cms.site-settings.update';
    const publish = 'cms.publication.publish-site';

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner)).toHaveProperty('status', 200);
    }

    await grant([read]);
    const actor = await login(email);

    expect(await request(settingsRoute, initial, actor)).toHaveProperty('status', 403);
    expect(await request(siteRoute + '/publish', {}, actor)).toHaveProperty('status', 403);
    const releases = connection.collection('publication_releases');
    const initialReleaseCount = await releases.countDocuments({ siteId });
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(page, origin, email, password);
      const main = page.getByRole('main', { name: 'Settings', exact: true });
      const publicOrigin = main.locator('#site-public-origin');
      const timezone = main.getByRole('combobox', { name: /^Site time zone/ });
      const save = main.getByRole('button', { name: 'Save settings', exact: true });
      const rebuild = main.getByRole('button', { name: 'Rebuild site', exact: true });
      const readOnly = main.getByText(/These settings are available to read/);
      const needsPublisher = main.getByText(/To update sitemap.xml with the saved public address/);
      const savedSettings = main.getByText('Site address settings saved.', { exact: true });
      const published = main.getByRole('status').filter({ hasText: 'Site published' });
      const writes: { path: string; body: unknown }[] = [];

      page.on('request', (outgoing) => {
        const path = new URL(outgoing.url()).pathname;

        if (outgoing.method() === 'POST' && path.startsWith('/api/admin' + siteRoute + '/')) {
          writes.push({ path: path.slice('/api/admin'.length), body: outgoing.postDataJSON() });
        }
      });

      await page.goto(origin + '/admin' + settingsRoute);
      await readOnly.waitFor();
      expect(await publicOrigin.inputValue()).toBe(initialAddress);
      expect(await publicOrigin.getAttribute('readonly')).not.toBeNull();
      expect(await timezone.isDisabled()).toBe(true);
      expect(await save.count()).toBe(0);
      expect(await rebuild.count()).toBe(0);
      expect(await needsPublisher.count()).toBe(0);

      await grant([read, publish]);
      await page.reload();
      await readOnly.waitFor();
      await main.getByText(/The site will be rebuilt using the saved settings/).waitFor();
      expect(await save.count()).toBe(0);
      await rebuild.click();
      await published.waitFor();
      expect(writes).toEqual([{ path: siteRoute + '/publish', body: {} }]);
      expect(await releases.countDocuments({ siteId })).toBe(initialReleaseCount + 1);

      await grant([read, update]);
      await page.reload();
      await expect.poll(() => publicOrigin.inputValue()).toBe(initialAddress);
      expect(await readOnly.count()).toBe(0);
      expect(await rebuild.count()).toBe(0);
      await timezone.selectOption('Europe/Chisinau');
      await save.click();
      await savedSettings.waitFor();
      expect(await needsPublisher.count()).toBe(0);
      await publicOrigin.fill(savedAddress);
      await save.click();
      await needsPublisher.waitFor();
      expect((await addresses()).publicOrigin).toBe(savedAddress);
      expect(await releases.countDocuments({ siteId })).toBe(initialReleaseCount + 1);

      await grant([read, update, publish]);
      await page.reload();
      await expect.poll(() => publicOrigin.inputValue()).toBe(savedAddress);
      await publicOrigin.fill(unsavedAddress);
      const previousWrites = writes.length;

      await rebuild.click();
      await published.waitFor();
      expect(writes.slice(previousWrites)).toEqual([{ path: siteRoute + '/publish', body: {} }]);
      expect((await addresses()).publicOrigin).toBe(savedAddress);
      expect(await releases.countDocuments({ siteId })).toBe(initialReleaseCount + 2);
    } finally {
      await browser.close();
    }
  }));

it('creates Hook drafts and assigns subscriptions through independent grants', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'HookAccess',
      name: 'Hook access',
      primaryDomain: 'hook-access.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const accessRoute = '/sites/' + siteId + '/access';
    const hooksRoute = '/sites/' + siteId + '/hooks';
    const createRoute = hooksRoute + '/handlers/create';
    const attachRoute = hooksRoute + '/subscriptions/save';
    const email = 'handler-author@example.test';
    const list = 'cms.hooks.list';
    const create = 'cms.hooks.create-handler';
    const attach = 'cms.hooks.save-subscription';

    expect(await request('/users', { email, password, siteId, roleId: 'cms.system.manager' }, owner))
      .toHaveProperty('status', 201);

    async function grant(actionIds: string[]): Promise<void> {
      const access = object(await (await request(accessRoute, undefined, owner)).json());

      expect(await request(accessRoute, { revision: access.revision, actionIds }, owner)).toHaveProperty('status', 200);
    }

    async function catalogue(): Promise<{ hooks: Record<string, unknown>[]; handlers: Record<string, unknown>[] }> {
      const response = await request(hooksRoute, undefined, owner);

      expect(response.status).toBe(200);
      const body = object(await response.json());
      const { hooks, handlers } = body;

      if (!Array.isArray(hooks) || !Array.isArray(handlers)) {
        throw new Error('Expected Hooks catalogue');
      }

      return { hooks: hooks.map(object), handlers: handlers.map(object) };
    }

    const event = (await catalogue()).hooks.find((hook) =>
      hook.kind === 'Event' && hook.scopeKind === 'Site' && hook.available === true);

    expect(event).toBeDefined();
    const hookKey = string(object(event).hookKey);
    const hookUrl = origin + '/admin' + hooksRoute + '/' + hookKey;

    async function subscriptions(): Promise<Record<string, unknown>[]> {
      const current = (await catalogue()).hooks.find((hook) => hook.hookKey === hookKey);
      const { subscriptions } = object(current);

      if (!Array.isArray(subscriptions)) {
        throw new Error('Expected Hook subscriptions');
      }

      return subscriptions.map(object);
    }

    await grant([create]);
    const actor = await login(email);

    expect(await request(hooksRoute, undefined, actor)).toHaveProperty('status', 403);
    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

      await signInAdminBrowser(page, origin, email, password);
      const workspace = page.getByRole('main', { name: 'Hooks workspace', exact: true });
      const title = workspace.locator('#new-hook-title');
      const separate = workspace.getByRole('button', { name: 'Create handler', exact: true });
      const combined = workspace.getByRole('button', { name: 'Create and attach', exact: true });
      const assign = workspace.getByRole('button', { name: 'Attach', exact: true });
      const hintText = 'You can save the handler. To attach it to a hook, request subscription access.';
      const hint = workspace.getByText(hintText, { exact: true });
      const created = workspace.getByRole('status').filter({ hasText: 'Handler created and ready to be assigned.' });
      const writes: { path: string; body: unknown }[] = [];
      let catalogReads = 0;

      page.on('request', (outgoing) => {
        const path = new URL(outgoing.url()).pathname;

        if (outgoing.method() === 'GET' && path === '/api/admin' + hooksRoute) {
          catalogReads += 1;
        } else if (outgoing.method() === 'POST' && path.startsWith('/api/admin' + hooksRoute + '/')) {
          writes.push({ path: path.slice('/api/admin'.length), body: outgoing.postDataJSON() });
        }
      });

      const roleEditorPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(roleEditorPage, origin, 'user-1@example.test', password);
      await roleEditorPage.goto(origin + '/admin/sites/' + siteId + '/settings');
      await roleEditorPage.getByRole('button', { name: 'Access', exact: true }).click();
      const roleHint = roleEditorPage.getByText(hintText, { exact: true });
      const subscriptionGrant = roleEditorPage.getByRole('checkbox', {
        name: 'Save a hook subscription · All · Hooks', exact: true,
      });

      await roleHint.waitFor();
      await subscriptionGrant.check();
      await roleHint.waitFor({ state: 'hidden' });
      await subscriptionGrant.uncheck();
      await roleHint.waitFor();
      await roleEditorPage.close();

      await page.goto(origin + '/admin' + hooksRoute);
      await hint.waitFor();
      await workspace.locator('#new-hook-kind').selectOption('Check');
      await title.fill('Standalone check');
      await separate.click();
      await created.waitFor();
      expect(await title.inputValue()).toBe('');
      expect(await combined.count()).toBe(0);
      expect(await assign.count()).toBe(0);
      expect(catalogReads).toBe(0);
      expect(writes).toMatchObject([{ path: createRoute, body: { title: 'Standalone check', kind: 'Check' } }]);
      expect((await catalogue()).handlers).toContainEqual(expect.objectContaining({
        title: 'Standalone check', kind: 'Check', enabled: false, activeVersionId: null,
      }));
      expect(await subscriptions()).toEqual([]);

      await grant([list, create]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(hookUrl);
      await hint.waitFor();
      await title.fill('Unassigned event');
      await separate.click();
      await created.waitFor();
      expect(await combined.count()).toBe(0);
      expect(await assign.count()).toBe(0);
      expect(writes.map(({ path }) => path)).toEqual([createRoute, createRoute]);

      const draft = (await catalogue()).handlers.find((handler) => handler.title === 'Unassigned event');

      expect(draft).toMatchObject({ kind: 'Event', enabled: false, activeVersionId: null });
      expect(await subscriptions()).toEqual([]);

      await grant([list, attach]);
      await page.reload();
      const existing = workspace.locator('#existing-hook-handler');
      const draftId = string(object(draft).handlerId);

      await existing.selectOption(draftId);
      expect(await hint.count()).toBe(0);
      expect(await separate.count()).toBe(0);
      expect(await combined.count()).toBe(0);
      const attached = page.waitForResponse((response) => response.url() === origin + '/api/admin' + attachRoute);

      await assign.click();
      const attachedResponse = await attached;

      expect(attachedResponse.status()).toBe(200);
      const binding = object(await attachedResponse.json());
      const denied = {
        subscription: { ...object(object(object(writes.at(-1)).body).subscription), subscriptionId: '' },
        expectedVersion: null,
      };

      expect(writes.map(({ path }) => path)).toEqual([createRoute, createRoute, attachRoute]);
      expect(await subscriptions()).toMatchObject([{ handlerId: draftId, enabled: false }]);

      await grant([list, create]);
      expect(await request(attachRoute, denied, actor)).toHaveProperty('status', 403);

      await grant([list, create, attach]);
      await page.goto(hookUrl);
      await combined.waitFor();
      expect(await hint.count()).toBe(0);
      await assign.waitFor();
      await title.fill('Combined event');
      const combinedResponse = page.waitForResponse((response) =>
        response.url() === origin + '/api/admin' + attachRoute);

      await combined.click();
      const combinedBinding = await combinedResponse;

      expect(combinedBinding.status()).toBe(200);
      const combinedId = string(object(await combinedBinding.json()).subscriptionId);

      await expect.poll(() => page.url()).toBe(hookUrl + '/handlers/' + combinedId);
      expect(page.url()).not.toContain(string(binding.subscriptionId));
      expect(writes.map(({ path }) => path)).toEqual([
        createRoute, createRoute, attachRoute, createRoute, attachRoute,
      ]);
      const newDraft = (await catalogue()).handlers.find((handler) => handler.title === 'Combined event');

      expect(newDraft).toMatchObject({ enabled: false, activeVersionId: null });
      expect(await subscriptions()).toEqual(expect.arrayContaining([
        expect.objectContaining({ handlerId: draftId, enabled: false }),
        expect.objectContaining({ handlerId: object(newDraft).handlerId, enabled: false }),
      ]));

      await page.goto(hookUrl);
      const subscriptionEndpoint = origin + '/api/admin' + attachRoute;

      await page.route(subscriptionEndpoint, (route) => route.fulfill({ status: 503, json: {} }), { times: 1 });
      await title.fill('Draft kept after failure');
      await combined.click();
      await workspace.getByRole('alert').filter({ hasText: 'Operation failed' }).waitFor();
      await created.waitFor();
      expect(await title.inputValue()).toBe('');
      const retained = (await catalogue()).handlers.find((handler) => handler.title === 'Draft kept after failure');
      const retainedId = string(object(retained).handlerId);

      expect((await subscriptions()).map(({ handlerId }) => handlerId)).not.toContain(retainedId);
      await existing.selectOption(retainedId);
      const retried = page.waitForResponse((response) => response.url() === subscriptionEndpoint);

      await assign.click();
      expect((await retried).status()).toBe(200);
      const sameTitle = (await catalogue()).handlers.filter((handler) => handler.title === 'Draft kept after failure');

      expect(sameTitle).toHaveLength(1);
      expect(await subscriptions()).toContainEqual(expect.objectContaining({ handlerId: retainedId, enabled: false }));
    } finally {
      await browser.close();
    }
  }));

async function disableAddonFromAnotherProcess(input: {
  database: string; directory: string; origin: string; cookie: string; route: string; version: string;
}): Promise<{ pid: number; status: number }> {
  const script = `
    import 'reflect-metadata';
    import path from 'node:path';
    import { request } from 'node:http';
    import { createPublicHttpApplication } from './dist/infra/public-http.application.js';

    const { database, directory, origin, cookie, route, version } = JSON.parse(process.env.ZARYA_TEST_SECONDARY_APP);
    if (!/^zarya_test_[a-f0-9]{32}$/.test(database)) throw new Error('Unsafe secondary test database');
    const app = await createPublicHttpApplication({
      mongoUri: process.env.ZARYA_TEST_MONGO_URI,
      database, host: '127.0.0.1', port: 0, backgroundWork: false,
      sourcesRoot: path.join(directory, 'sites'),
      artifactsRoot: path.join(directory, 'artifacts'),
      dumpsRoot: path.join(directory, 'dumps'),
      adminAuth: { origin },
    });
    try {
      const body = JSON.stringify({ expectedVersion: version });
      const response = await new Promise((resolve, reject) => {
        const command = request({
          hostname: '127.0.0.1', port: app.getHttpServer().address().port,
          path: '/api/admin' + route + '/disable', method: 'POST',
          headers: {
            Host: new URL(origin).host, Origin: origin, Cookie: cookie, 'X-Zarya-Admin': '1',
            'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
          },
        }, (result) => {
          result.resume();
          result.on('end', () => resolve(result.statusCode));
          result.on('error', reject);
        });
        command.on('error', reject);
        command.end(body);
      });
      console.log(JSON.stringify({ pid: process.pid, status: response }));
    } finally {
      await app.close();
    }
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, ZARYA_TEST_SECONDARY_APP: JSON.stringify(input) },
    timeout: 16000,
    windowsHide: true,
  });

  return JSON.parse(stdout.trimEnd().split('\n').at(-1)!);
}

it('explains unbound add-on screens and denies delegated navigation', { timeout: 90000 }, () =>
  withAdminHttpFixture(async ({ app, connection, directory, origin, password, request, login }) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const owner = await login('user-1@example.test');
    const site = await request('/sites', {
      mark: 'AddonAccess',
      name: 'Addon access',
      primaryDomain: 'addon-access.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(site.status).toBe(201);
    const siteId = string(object(await site.json()).siteId);
    const siteRoute = '/sites/' + siteId;
    const addons = siteRoute + '/addons';
    const registry = app.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);
    const catalogConnection = app.get<Connection>(MONGO_CONNECTION);

    async function installFixture(addonKey: string, withScreen: boolean, bound = false): Promise<void> {
      const packageDirectory = path.join(directory, addonKey);
      const label = bound ? 'Requests fixture' : withScreen ? 'Screen fixture' : 'Headless fixture';
      const route = '/api/admin/sites/:siteId/' + addonKey;
      const writeId = addonKey + '.write';
      const readId = addonKey + '.read';
      const detailsId = addonKey + '.details';
      const badgeId = addonKey + '.badge';
      const readRoutesAndActions = [
        { route: route + '/details', actionId: detailsId, shortDescription: 'Read request details' },
        { route: route + '/menu-badge', actionId: badgeId, shortDescription: 'Read request count' },
      ];
      const handler = bound ? `async (request, response) => {
        const access = host.authorization.read(request);
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/json');
          if (!Object.isFrozen(access) || !Object.isFrozen(access.scopes) || !Object.isFrozen(access.groupIds)) {
            throw new Error('Expected a read-only authority context');
          }
          const pathname = new URL(request.url, 'http://fixture.test').pathname;
          if (pathname.endsWith('/menu-badge')) {
            const count = await host.connection.db.collection('synthetic_unread').countDocuments({ siteId: access.siteId });
            response.setHeader('Cache-Control', 'private, no-store');
            response.end(JSON.stringify({ count }));
            return;
          }
          if (pathname.endsWith('/details')) {
            response.end(JSON.stringify({ text: 'Private request detail' }));
            return;
          }
          const filters = [];
          if (access.scopes.includes('own')) filters.push({ createdBy: access.actorId });
          if (access.scopes.includes('groups')) filters.push({ groupId: { $in: access.groupIds } });
          const where = { siteId: access.siteId, ...(access.scopes.includes('all') ? {} : { $or: filters }) };
          const items = host.connection.db.collection('synthetic_requests');
          const total = await items.countDocuments(where);
          const rows = await items.find(where).sort({ name: 1 }).limit(2).toArray();
          response.end(JSON.stringify({ ...access, total, rows: rows.map(row => row.name) }));
          return;
        }
        const session = await host.connection.startSession();
        try {
          const permit = await host.policy().authorize(access.siteId, 'AdministrationEnabled');
          if (request.url.endsWith('?hold=1')) {
            await host.connection.db.collection('synthetic_write_barriers').insertOne({ siteId: access.siteId });
          }
          for await (const chunk of request) { void chunk; }
          await session.withTransaction(async () => {
            const current = await host.authorization.write(request, permit, session);
            await host.connection.db.collection('synthetic_requests').insertOne({
              siteId: current.siteId, createdBy: current.actorId
            }, { session });
            await host.connection.db.collection('synthetic_unread').deleteMany({ siteId: current.siteId }, { session });
          });
        } catch (error) {
          if (error.code !== 'Forbidden') throw error;
          response.writeHead(403).end();
          return;
        } finally { await session.endSession(); }
        response.setHeader('Content-Type', 'application/json');
        response.end('{"saved":true}');
      }` : 'async (_request, response) => { response.end("[]"); }';
      const httpRoutes = withScreen ? [
        { method: 'GET', route },
        ...(bound ? [
          { method: 'POST', route },
          ...readRoutesAndActions.map((read) => ({ method: 'GET', route: read.route })),
        ] : []),
      ] : [];
      const browserView = bound ? `export function mount(target, host) {
        const title = document.createElement('h2');
        title.textContent = 'Requests';
        target.append(title);
        if (new URLSearchParams(host.location).get('view') === 'details') {
          void host.request('/${addonKey}/details').then(
            (details) => { title.textContent = details.text; },
            () => { title.textContent = 'Request details denied'; },
          );
          return { update() {}, destroy() { target.replaceChildren(); } };
        }
        if (host.can('${detailsId}')) {
          const details = document.createElement('a');
          details.textContent = 'Request details';
          details.href = '?view=details';
          target.append(details);
        }
        const hint = document.createElement('p');
        hint.textContent = 'Request access to save requests.';
        const button = document.createElement('button');
        button.textContent = 'Save request';
        button.onclick = async () => {
          try {
            await host.request('/${addonKey}', {});
            title.textContent = 'Request saved';
          } catch { title.textContent = 'Saving denied'; }
        };
        target.append(host.can('${writeId}') ? button : hint);
        return { update() {}, destroy() { target.replaceChildren(); } };
      }` : 'export function mount(target) { const title = document.createElement("h2"); '
        + 'title.textContent = "Test add-on screen"; target.append(title); '
        + 'return { update() {}, destroy() { title.remove(); } }; }';
      const contents = {
        'server.cjs': 'exports.validateConfiguration = () => {}; '
          + 'exports.defaultConfiguration = () => ({ schemaVersion: 1, values: {} }); '
          + 'exports.httpRoutes = ' + JSON.stringify(httpRoutes) + '; '
          + 'exports.createRuntime = (host) => ({ canHandle: (pathname) => '
          + (withScreen
            ? 'pathname.startsWith("/api/admin/sites/") && ' + JSON.stringify(httpRoutes.map((item) =>
              item.route.split('/:siteId')[1])).replaceAll(':siteId', '') + '.some((route) => pathname.endsWith(route))'
            : 'false')
          + ', handle: ' + handler + ' });',
        'migrations/0000-runtime.json': JSON.stringify({ id: '0000-runtime', collections: [] }),
        ...(withScreen ? { 'admin.js': browserView, 'server/http-routes.json': JSON.stringify(httpRoutes) } : {}),
      };
      const files: Record<string, string> = {};

      await mkdir(path.join(packageDirectory, 'migrations'), { recursive: true });
      await mkdir(path.join(packageDirectory, 'server'));

      for (const [name, source] of Object.entries(contents)) {
        await writeFile(path.join(packageDirectory, name), source);
        files[name] = createHash('sha256').update(source).digest('hex');
      }

      await writeFile(path.join(packageDirectory, 'addon.runtime.json'), JSON.stringify({
        format: 'zarya-addon',
        version: 1,
        definition: {
          addonKey,
          name: { en: label, ru: label },
          description: { en: label, ru: label },
          contractVersion: 1,
          implementationVersion: '1.0.0',
          configurationSchemaVersion: 1,
          adminComponentId: null,
          snippetIds: [],
          ...(withScreen ? { adminMenu: { en: bound ? 'Requests' : 'Fixture menu', ru: label } } : {}),
        },
        collections: [],
        files,
        serverEntry: 'server.cjs',
        adminEntry: withScreen ? 'admin.js' : null,
        styles: [],
        dependencies: {},
        ...(withScreen ? {
          routes: [route, ...(bound ? readRoutesAndActions.map((read) => read.route) : [])],
          authorization: {
            version: 1,
            domains: [{
              domainId: addonKey + '.items', name: 'Items', description: 'Items managed by the add-on.',
            }],
            actions: [{
              actionId: readId,
              method: 'GET',
              route,
              scope: 'site',
              admission: 'admin',
              shortDescription: 'Read items',
              description: 'Read the add-on items.',
              domains: [addonKey + '.items', 'cms.pages'],
              create: false,
              read: true,
              update: false,
              delete: false,
              execute: false,
              allowedObjectScopes: bound ? ['all', 'own', 'groups'] : ['all'],
            }, ...(bound ? [{
              actionId: writeId,
              method: 'POST',
              route,
              scope: 'site',
              admission: 'admin',
              shortDescription: 'Save requests',
              description: 'Save a request.',
              domains: [addonKey + '.items'],
              create: true,
              read: false,
              update: false,
              delete: false,
              execute: false,
              allowedObjectScopes: ['all'],
            }, ...readRoutesAndActions.map((read) => ({
              ...read,
              method: 'GET',
              scope: 'site',
              admission: 'admin',
              description: read.shortDescription + '.',
              domains: [addonKey + '.items'],
              create: false,
              read: true,
              update: false,
              delete: false,
              execute: false,
              allowedObjectScopes: ['all'],
            }))] : [])],
            ...(bound ? {
              adminUi: {
                views: [
                  { id: 'main', actionIds: [readId] },
                  { id: 'details', actionIds: [detailsId] },
                ],
              },
            } : {}),
          },
        } : {}),
      }));
      await registry.install(packageDirectory);
    }

    const screenKey = 'synthetic-screen';
    const headlessKey = 'synthetic-headless';
    const boundKey = 'synthetic-requests';
    const direct = '/admin' + addons + '/' + screenKey;
    const runtime = siteRoute + '/addon-runtime/' + screenKey;
    const settings = { expectedVersion: null, configuration: { schemaVersion: 1, values: {} } };

    await installFixture(screenKey, true);
    await installFixture(headlessKey, false);
    await installFixture(boundKey, true, true);
    await connection.createCollection('synthetic_requests');
    const unread = await connection.createCollection<{ siteId: string }>('synthetic_unread');
    const otherSite = await request('/sites', {
      mark: 'AddonBadgeSecond',
      name: 'Second badge site',
      primaryDomain: 'badge-second.example.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }, owner);

    expect(otherSite.status).toBe(201);
    const otherSiteId = string(object(await otherSite.json()).siteId);
    const otherSiteRoute = '/sites/' + otherSiteId;
    const otherAddon = otherSiteRoute + '/addons/' + boundKey;

    await unread.insertMany([{ siteId }, { siteId: otherSiteId }, { siteId: otherSiteId }]);
    expect(await request(otherAddon + '/enable', settings, owner)).toHaveProperty('status', 200);
    expect(await request(addons + '/' + boundKey + '/enable', settings, owner)).toHaveProperty('status', 200);
    expect(await request(addons + '/' + screenKey + '/enable', settings, owner)).toHaveProperty('status', 200);

    const adminEmail = 'addon-site-admin@example.test';
    const delegateEmail = 'addon-delegate@example.test';

    expect(await request('/users', {
      email: adminEmail, password, siteId, roleId: 'cms.system.site-admin',
    }, owner)).toHaveProperty('status', 201);
    expect(await request('/users', {
      email: delegateEmail, password, siteId, roleId: 'cms.system.manager',
    }, owner)).toHaveProperty('status', 201);

    const accessRoute = siteRoute + '/access';
    const access = object(await (await request(accessRoute, undefined, owner)).json());
    const readId = screenKey + '.read';
    const actions = Array.isArray(access.actions) ? access.actions.map(object) : [];

    expect(actions.find(({ actionId }) => actionId === readId)).toMatchObject({
      domains: [screenKey + '.items', 'cms.pages'],
      allowedObjectScopes: ['all'],
    });
    expect(access.delegableActionIds).toContain(screenKey + '.read');
    const managementGrants = ['cms.addons.list', 'cms.addons.read', 'cms.addon-runtime.read-view',
      'cms.addon-runtime.read-asset', 'cms.site-settings.read'];

    expect(await request(accessRoute, { revision: access.revision, actionIds: managementGrants }, owner))
      .toHaveProperty('status', 200);
    const admin = await login(adminEmail);
    const delegate = await login(delegateEmail);
    const actionPath = siteRoute + '/' + screenKey;

    expect(await request(actionPath, undefined, admin)).toHaveProperty('status', 200);
    expect(await request(actionPath, undefined, delegate)).toHaveProperty('status', 403);
    const assigned = object(await (await request(accessRoute, undefined, owner)).json());

    expect(await request(accessRoute, { revision: assigned.revision, actionIds: [...managementGrants, readId] }, owner))
      .toHaveProperty('status', 200);
    expect(await request(actionPath, undefined, delegate)).toHaveProperty('status', 200);
    expect(await request(actionPath, {}, delegate)).toHaveProperty('status', 403);
    const generations = connection.collection<{ _id: string; digest: string }>('addon_action_generations');
    const controls = connection.collection<{ _id: string; state: Record<string, unknown> | null }>(
      'addon_runtime_controls');
    const generationId = 'addon:' + screenKey;
    const fromDigest = string((await generations.findOne({ _id: generationId }))?.digest);
    const toDigest = 'f'.repeat(64);
    const { authorization } = await registry.validatePackage(path.join(directory, screenKey));

    expect(authorization).toBeDefined();
    const declaration = authorization!;
    const changed = { ...declaration, actions: declaration.actions.map((action) => ({ ...action, update: true })) };

    await expect(registry.actionCatalog.validate(screenKey, changed)).rejects.toThrow('Use a new Action ID');
    await expect(catalogConnection.transaction(async (session) => {
      await registry.actionCatalog.activate(screenKey, toDigest, { ...declaration, actions: [] }, session);
      throw new Error('Synthetic activation aborted');
    })).rejects.toThrow('Synthetic activation aborted');
    expect((await generations.findOne({ _id: generationId }))?.digest).toBe(fromDigest);
    expect(await request(actionPath, undefined, delegate)).toHaveProperty('status', 200);
    await catalogConnection.transaction((session) => registry.actionCatalog.activate(
      screenKey, toDigest, declaration, session,
    ));
    expect(await request(actionPath, undefined, delegate)).toHaveProperty('status', 503);
    await controls.updateOne({ _id: screenKey }, {
      $set: {
        state: {
          addonKey: screenKey,
          updateId: 'test-overlap',
          fromDigest,
          toDigest,
          fromVersion: '1.0.0',
          toVersion: '1.1.0',
          mode: 'Compatible',
          phase: 'Completed',
          paused: false,
          forcedProcessCount: 0,
          updatedAt: new Date(),
        },
      },
    });
    expect(await request(actionPath, undefined, delegate)).toHaveProperty('status', 200);
    await controls.updateOne({ _id: screenKey }, { $set: { 'state.mode': 'Exclusive' } });
    expect(await request(actionPath, undefined, delegate)).toHaveProperty('status', 503);
    await controls.updateOne({ _id: screenKey }, { $set: { state: null } });
    await catalogConnection.transaction((session) => registry.actionCatalog.activate(
      screenKey, fromDigest, declaration, session,
    ));

    const result = await request(addons, undefined, admin);

    expect(result.status).toBe(200);
    const { items } = object(await result.json());

    if (!Array.isArray(items)) {
      throw new Error('Expected an add-on catalog');
    }

    const entries = items.map(object);

    expect(entries.find((item) => item.addonKey === screenKey)?.adminScreenPermissionsMissing).toBe(true);
    expect(entries.find((item) => item.addonKey === headlessKey)).toBeDefined();
    expect(entries.find((item) => item.addonKey === headlessKey)?.adminScreenPermissionsMissing).toBeUndefined();
    const view = await request(runtime, undefined, admin);

    expect(view.status).toBe(200);
    const digest = string(object(await view.json()).digest);

    expect(await request(addons, undefined, delegate)).toHaveProperty('status', 200);
    expect(await request(addons + '/' + screenKey, undefined, delegate)).toHaveProperty('status', 200);

    for (const path of [runtime, runtime + '/' + digest + '/admin.js']) {
      expect(await request(path, undefined, delegate)).toHaveProperty('status', 403);
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const adminPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(adminPage, origin, adminEmail, password);
      await adminPage.goto(origin + '/admin' + addons);
      const screen = adminPage.locator('article').filter({
        has: adminPage.getByRole('heading', { name: 'Screen fixture', exact: true }),
      });
      const headless = adminPage.locator('article').filter({
        has: adminPage.getByRole('heading', { name: 'Headless fixture', exact: true }),
      });
      const hint = 'The add-on developer has yet to set access permissions for this screen.';

      await screen.getByText(hint, { exact: true }).waitFor();
      await headless.waitFor();
      expect(await headless.getByText(hint, { exact: true }).count()).toBe(0);
      expect(await adminPage.getByRole('button', { name: 'Fixture menu', exact: true }).count()).toBe(0);
      const language = adminPage.locator('.admin-language select');

      await language.selectOption('ru');
      await screen.getByText('Для этого экрана разработчик аддона ещё не настроил права.', { exact: true }).waitFor();
      await language.selectOption('en');
      await screen.getByRole('button', { name: 'Settings', exact: true }).click();
      await adminPage.getByRole('heading', { name: 'Test add-on screen', exact: true }).waitFor();

      const delegatedPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const outgoing: string[] = [];

      await signInAdminBrowser(delegatedPage, origin, delegateEmail, password);
      delegatedPage.on('request', (request) => {
        const path = new URL(request.url()).pathname;

        if (path.startsWith('/api/admin' + addons + '/') || path.startsWith('/api/admin' + runtime)) {
          outgoing.push(path);
        }
      });

      await delegatedPage.goto(origin + direct + '?view=unbound');
      await delegatedPage.getByRole('status').filter({ hasText: /This add-on screen is unavailable to your role/ })
        .waitFor();
      await delegatedPage.goto(origin + '/admin' + addons);
      await delegatedPage.getByRole('heading', { name: 'Screen fixture', exact: true }).waitFor();
      expect(await delegatedPage.getByText(hint, { exact: true }).count()).toBe(0);
      expect(await delegatedPage.getByRole('button', { name: 'Fixture menu', exact: true }).count()).toBe(0);
      expect(await delegatedPage.getByRole('heading', { name: 'Test add-on screen', exact: true }).count()).toBe(0);
      expect(outgoing).toEqual([]);

      const boundRoute = siteRoute + '/' + boundKey;
      const boundRead = boundKey + '.read';
      const boundWrite = boundKey + '.write';
      const details = boundKey + '.details';
      const badgeAction = boundKey + '.badge';
      const badgeRoute = boundRoute + '/menu-badge';
      const boundScreen = origin + '/admin' + addons + '/' + boundKey;
      const detailsUrl = boundScreen + '?view=details';

      async function grantBound(actionIds: string[]): Promise<void> {
        const current = object(await (await request(accessRoute, undefined, owner)).json());

        expect(await request(accessRoute, { revision: current.revision, actionIds }, owner))
          .toHaveProperty('status', 200);
      }

      await grantBound([boundRead]);
      const granted = await request(boundRoute, undefined, delegate);

      expect(granted.status).toBe(200);
      expect(await granted.json()).toMatchObject({ siteId, actionId: boundRead, scopes: ['all'] });
      const openWrite = (path: string, receive: (status: number | undefined) => void,
        failed: (error: Error) => void): ReturnType<typeof httpRequest> => {
        const pending = httpRequest(origin + '/api/admin' + path, {
          method: 'POST',
          headers: {
            Host: new URL(origin).host,
            Origin: origin,
            'X-Zarya-Admin': '1',
            Cookie: delegate,
            'Content-Type': 'application/json',
            'Content-Length': 2,
          },
        }, (response) => {
          response.resume();
          receive(response.statusCode);
        });

        pending.on('error', failed);
        pending.setTimeout(20000, () => pending.destroy(new Error('Timed out waiting for authorization')));
        pending.flushHeaders();

        return pending;
      };
      const deniedBeforeBody = await new Promise<number | undefined>((resolve, reject) => {
        openWrite(boundRoute, resolve, reject);
      });

      expect(deniedBeforeBody).toBe(403);
      await delegatedPage.reload();
      await delegatedPage.getByRole('button', { name: 'Requests', exact: true }).click();
      await delegatedPage.getByText('Request access to save requests.', { exact: true }).waitFor();
      expect(await delegatedPage.getByRole('button', { name: 'Save request', exact: true }).count()).toBe(0);
      expect(await delegatedPage.getByRole('link', { name: 'Request details', exact: true }).count()).toBe(0);
      expect(await request(boundRoute + '/details', undefined, delegate)).toHaveProperty('status', 403);
      expect(await request(badgeRoute, undefined, delegate)).toHaveProperty('status', 403);
      const unavailableReads: string[] = [];
      const observeUnavailableRead = (outgoing: { url(): string }): void => {
        const pathname = new URL(outgoing.url()).pathname;

        if (
          pathname.includes('/addon-workspaces/' + boundKey + '/')
          || pathname === '/api/admin' + boundRoute + '/details'
        ) {
          unavailableReads.push(pathname);
        }
      };

      delegatedPage.on('request', observeUnavailableRead);

      try {
        await delegatedPage.goto(detailsUrl);
        await delegatedPage.getByRole('status').filter({ hasText: /This add-on screen is unavailable to your role/ })
          .waitFor();
        expect(unavailableReads).toEqual([]);
      } finally {
        delegatedPage.off('request', observeUnavailableRead);
      }

      await grantBound([boundRead, details, badgeAction]);
      await delegatedPage.goto(boundScreen);
      await delegatedPage.getByRole('link', { name: 'Request details', exact: true }).click();
      await delegatedPage.getByRole('heading', { name: 'Private request detail', exact: true }).waitFor();

      const count = await request(badgeRoute, undefined, delegate);

      expect(count.status).toBe(200);
      expect(count.headers.get('cache-control')).toContain('no-store');
      expect(count.headers.get('cache-control')).toContain('private');
      expect(await count.json()).toEqual({ count: 1 });

      const otherBadgeRoute = otherSiteRoute + '/' + boundKey + '/menu-badge';

      for (const [route, expected] of [[badgeRoute, 1], [otherBadgeRoute, 2]] as const) {
        const result = await request(route, undefined, owner);

        expect(result.status).toBe(200);
        expect(result.headers.get('cache-control')).toContain('no-store');
        expect(await result.json()).toEqual({ count: expected });
      }

      await delegatedPage.goto(boundScreen);
      const badge = delegatedPage.getByRole('button', { name: 'Requests', exact: true }).locator('._addon-menu-badge');

      await badge.filter({ hasText: /^1$/ }).waitFor();
      const roleEditor = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      await signInAdminBrowser(roleEditor, origin, 'user-1@example.test', password);
      await roleEditor.goto(origin + '/admin/sites/' + siteId + '/settings');
      await roleEditor.getByRole('button', { name: 'Access', exact: true }).click();
      await roleEditor.getByRole('checkbox', { name: /^Save requests · All · / }).check();
      const roleSaved = roleEditor.waitForResponse((response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/admin' + accessRoute));

      await roleEditor.getByRole('button', { name: 'Save', exact: true }).click();
      const saved = await roleSaved;

      expect(saved.status()).toBe(200);
      expect(object(await saved.json()).managerActionIds).toContain(boundWrite);
      await delegatedPage.reload();
      const save = delegatedPage.getByRole('button', { name: 'Save request', exact: true });

      await save.click();
      await delegatedPage.getByRole('heading', { name: 'Request saved', exact: true }).waitFor();
      await badge.waitFor({ state: 'hidden' });
      expect(await unread.countDocuments({ siteId })).toBe(0);
      expect(await connection.collection('synthetic_requests').countDocuments({ siteId })).toBe(1);
      await grantBound([boundRead]);
      await save.click();
      await delegatedPage.getByRole('heading', { name: 'Saving denied', exact: true }).waitFor();
      const requests = connection.collection('synthetic_requests');

      expect(await requests.countDocuments({ siteId })).toBe(1);
      await grantBound([boundRead, boundWrite]);
      let pending: ReturnType<typeof httpRequest> | undefined;
      const staleWrite = new Promise<number | undefined>((resolve, reject) => {
        pending = openWrite(boundRoute + '?hold=1', resolve, reject);
      });

      try {
        await expect.poll(async () => connection.collection('synthetic_write_barriers').countDocuments({ siteId }))
          .toBe(1);
        await grantBound([boundRead]);
        pending!.end('{}');
        expect(await staleWrite).toBe(403);
        expect(await requests.countDocuments({ siteId })).toBe(1);
      } finally {
        pending?.destroy();
        await staleWrite.catch(() => undefined);
      }
      const connectionRoute = addons + '/' + boundKey;
      const beforeDisable = object(await (await request(connectionRoute, undefined, owner)).json());
      const version = string(object(beforeDisable.connection).version);

      expect(version).not.toBe('');
      await grantBound([boundRead, boundWrite]);
      const pendingConnectionWrite = new Promise<number | undefined>((resolve, reject) => {
        pending = openWrite(boundRoute + '?hold=1', resolve, reject);
      });
      const observedConnectionWrite = Promise.allSettled([pendingConnectionWrite]);

      try {
        await expect.poll(async () => connection.collection('synthetic_write_barriers').countDocuments({ siteId }))
          .toBe(2);
        const disabled = await disableAddonFromAnotherProcess({
          database: connection.name, directory, origin, cookie: owner, route: connectionRoute, version,
        });

        expect(disabled).toMatchObject({ status: 200 });
        expect(disabled.pid).not.toBe(process.pid);
        pending!.end('{}');
        expect(await pendingConnectionWrite).toBe(503);
        expect(await requests.countDocuments({ siteId })).toBe(1);
        expect(await request(boundRoute, {}, delegate)).toHaveProperty('status', 503);
      } finally {
        pending?.destroy();
        await observedConnectionWrite;
      }

      const afterDisable = object(await (await request(connectionRoute, undefined, owner)).json());
      const disabledConnection = object(afterDisable.connection);

      expect(disabledConnection.status).toBe('Disabled');
      expect(await request(connectionRoute + '/enable', {
        ...settings, expectedVersion: disabledConnection.version,
      }, owner)).toHaveProperty('status', 200);

      const actorId = string(object(object(await (await request('/auth/me', undefined, delegate)).json()).user)
        .adminUserId);
      const current = object(await (await request(accessRoute, undefined, owner)).json());
      const groupResponse = await request(accessRoute, {
        revision: current.revision,
        actionIds: [],
        group: {
          groupId: null,
          key: 'requests-team',
          name: 'Requests team',
          description: 'Synthetic request group',
          actorIds: [actorId],
        },
      }, owner);

      expect(groupResponse.status).toBe(200);
      const catalog = object(await groupResponse.json());
      const group = Array.isArray(catalog.groups)
        && catalog.groups.map(object).find((item) => item.key === 'requests-team');
      const groupId = string(object(group).groupId);

      await requests.updateOne({ siteId, createdBy: actorId }, { $set: { name: 'Own' } });
      await requests.insertMany([
        { siteId, createdBy: 'other', name: 'A different owner' },
        { siteId, createdBy: 'other', name: 'Group', groupId },
        { siteId: 'different-site', createdBy: actorId, name: 'Another site', groupId },
      ]);
      expect(await request(accessRoute, {
        revision: catalog.revision,
        actionIds: [boundRead],
        objectScopes: { [boundRead]: ['own', 'groups'] },
      }, owner)).toHaveProperty('status', 200);
      const scoped = await request(boundRoute, undefined, delegate);

      expect(scoped.status).toBe(200);
      expect(await scoped.json()).toMatchObject({
        actorId,
        siteId,
        actionId: boundRead,
        groupIds: [groupId],
        scopes: ['own', 'groups'],
        total: 2,
        rows: ['Group', 'Own'],
      });

      const countRequests: string[] = [];

      delegatedPage.on('request', (outgoing) => {
        if (outgoing.url().endsWith('/menu-badge')) {
          countRequests.push(outgoing.url());
        }
      });
      await delegatedPage.reload();
      await delegatedPage.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
      expect(countRequests).toEqual([]);

      await unread.insertOne({ siteId });
      const lateBadgeUrl = origin + '/api/admin' + badgeRoute;
      const otherBadgeUrl = origin + '/api/admin' + otherBadgeRoute;
      let hold!: () => void;
      let failHold!: (error: unknown) => void;
      let deliver!: () => void;
      const held = new Promise<void>((resolve, reject) => {
        hold = resolve;
        failHold = reject;
      });
      const delivery = new Promise<void>((resolve) => {
        deliver = resolve;
      });

      await roleEditor.route(lateBadgeUrl, async (route) => {
        try {
          const response = await route.fetch();

          expect(await response.json()).toEqual({ count: 1 });
          hold();
          await delivery;
          await route.fulfill({ response });
        } catch (error) {
          failHold(error);
          throw error;
        }
      }, { times: 1 });

      try {
        await Promise.all([held, roleEditor.goto(origin + '/admin' + siteRoute)]);
        await roleEditor.getByRole('button', { name: 'All sites', exact: true }).click();
        await roleEditor.getByRole('button', { name: /Second badge site/ }).click();
        const otherBadge = roleEditor.getByRole('button', { name: 'Requests', exact: true })
          .locator('._addon-menu-badge');

        await otherBadge.filter({ hasText: /^2$/ }).waitFor();
        const late = roleEditor.waitForResponse(lateBadgeUrl);

        deliver();
        expect((await late).status()).toBe(200);
        expect(await otherBadge.textContent()).toBe('2');
      } finally {
        deliver();
        await roleEditor.unroute(lateBadgeUrl);
      }

      const otherView = object(await (await request(otherAddon, undefined, owner)).json());
      const otherConnection = object(otherView.connection);

      expect(await request(otherAddon + '/disable', { expectedVersion: otherConnection.version }, owner))
        .toHaveProperty('status', 200);
      const disabledRequests: string[] = [];

      roleEditor.on('request', (outgoing) => {
        if (outgoing.url() === otherBadgeUrl) {
          disabledRequests.push(outgoing.url());
        }
      });
      await roleEditor.reload();
      await roleEditor.getByRole('button', { name: 'Add-ons', exact: true }).waitFor();
      expect(await roleEditor.locator('._addon-menu-badge').count()).toBe(0);
      expect(disabledRequests).toEqual([]);
    } finally {
      await browser.close();
    }
  }));

it('assigns URLs to draft authors with no URL actions and preserves site transliteration overrides', () =>
  withAdminHttpFixture(async ({ connection, password, request, login }) => {
    const ownerCookie = await login('user-1@example.test');
    const createSite = async (mark: string, languages: readonly string[]): Promise<string> => {
      const response = await request('/sites', {
        mark, name: mark, primaryDomain: mark.toLowerCase() + '.example.test', languages, defaultLanguage: 'en',
      }, ownerCookie);

      expect(response.status).toBe(201);

      return string(object(await response.json()).siteId);
    };
    const one = await createSite('TransliterationSite', ['en', 'ru', 'el', 'de', 'fr', 'pl']);
    const two = await createSite('ForeignSite', ['en']);
    const selected = '/sites/' + one;
    const siteAdminEmail = 'site-admin@example.test';

    expect(await request('/users', {
      email: siteAdminEmail, password, roleId: 'cms.system.site-admin', siteId: one,
    }, ownerCookie)).toHaveProperty('status', 201);
    const siteAdminCookie = await login(siteAdminEmail);
    const content = { language: 'en', contentMd: '' };
    const releases = connection.collection('publication_releases');
    const initialReleases = await releases.countDocuments({ siteId: one });
    const freshAccess = object(await (await request(selected + '/access', undefined, siteAdminCookie)).json());
    const draftRole = await request(selected + '/access', {
      revision: freshAccess.revision,
      role: { roleId: null, key: 'draft-author', name: 'Draft author', description: 'Creates drafts', actorIds: [] },
      actionIds: ['cms.pages.create'],
    }, siteAdminCookie);

    expect(draftRole.status).toBe(200);
    const { customRoles } = object(await draftRole.json());
    const authorRole = Array.isArray(customRoles)
      && customRoles.map(object).find((item) => item.key === 'draft-author');
    const authorEmail = 'draft-author@example.test';

    expect(authorRole).toBeTruthy();
    const roleId = string(object(authorRole).roleId);
    const createdAuthor = await request('/users', { email: authorEmail, password, roleId, siteId: one }, ownerCookie);

    expect(createdAuthor.status).toBe(201);
    const { adminUserId } = object(await createdAuthor.json());
    const authorCookie = await login(authorEmail);
    const pagesPath = selected + '/pages';
    const urls = connection.collection<IUrlRecord>('urls');

    async function draft(mark: string, language: string, h1: string, input: Record<string, unknown> = {}):
    Promise<string> {
      const response = await request(pagesPath, {
        ...content, mark, language, h1, title: mark, ...input,
      }, authorCookie);
      const state = object(await response.json());

      expect(response.status, mark + ': ' + JSON.stringify(state)).toBe(201);
      expect(state).toMatchObject({ status: 'DRAFT', publishedAt: null, language, h1 });

      return string(state.pageId);
    }

    expect(await request(pagesPath, undefined, authorCookie)).toHaveProperty('status', 403);
    expect(await request(selected + '/urls', undefined, authorCookie)).toHaveProperty('status', 403);
    expect(await request('/sites/' + two + '/pages', { ...content, h1: 'Foreign', title: 'Foreign', mark: 'Foreign' },
      authorCookie)).toHaveProperty('status', 403);

    const samples = [
      ['RussianDraft', 'ru', '«Ёж» — Школа: Часть 2', '/yozh-shkola-chast-2'],
      ['GreekDraft', 'el', 'Αθήνα: Ψυχή', '/athina-psychi'],
      ['GermanDraft', 'de', 'Über Größe', '/ueber-groesse'],
      ['FrenchDraft', 'fr', 'Cafe\u0301: cœur d’été', '/cafe-coeur-dete'],
      ['PolishDraft', 'pl', 'Łódź — Żółć', '/lodz-zolc'],
    ] as const;

    for (const [mark, language, h1, path] of samples) {
      const pageId = await draft(mark, language, h1);

      expect(await urls.findOne({ siteId: one, pageId })).toMatchObject({ path, kind: 'PAGE' });
    }
    const parent = await draft('RealParent', 'en', 'Guides');
    const parentUrl = await urls.findOne({ siteId: one, pageId: parent });
    const child = await draft('ChildOne', 'ru', 'Мой раздел', { parentPageId: parent });
    const collision = await draft('ChildTwo', 'ru', 'Мой раздел', { parentPageId: parent });

    expect(await urls.findOne({ siteId: one, pageId: child }))
      .toMatchObject({ path: '/guides/moy-razdel', parentUrlId: parentUrl?._id });
    expect(await urls.findOne({ siteId: one, pageId: collision }))
      .toMatchObject({ path: '/guides/moy-razdel-2', parentUrlId: parentUrl?._id });

    let entered!: () => void;
    let resume!: () => void;
    const prepared = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const savePage = MongoosePageRepository.prototype.save;
    const pauseCreation = vi.spyOn(MongoosePageRepository.prototype, 'save')
      .mockImplementation(async function(this: MongoosePageRepository, ...args) {
        if (args[0].mark === 'InterleavedDraft') {
          entered();
          await released;
        }

        return savePage.apply(this, args);
      });
    const sameHeading = { ...content, title: 'Concurrent', h1: 'Concurrent' };
    const pending = request(pagesPath, { ...sameHeading, mark: 'InterleavedDraft' }, authorCookie);

    try {
      await Promise.race([prepared, pending.then(() => {
        throw new Error('Create did not prepare the URL');
      })]);
      const winner = await draft('WinnerDraft', 'en', 'Concurrent');

      expect(await urls.findOne({ siteId: one, pageId: winner })).toMatchObject({ path: '/concurrent' });
    } finally {
      resume();
      pauseCreation.mockRestore();
    }
    expect(await pending).toHaveProperty('status', 409);
    expect(await connection.collection('pages').countDocuments({ siteId: one, mark: 'InterleavedDraft' })).toBe(0);
    const retried = await draft('InterleavedDraft', 'en', 'Concurrent');

    expect(await urls.findOne({ siteId: one, pageId: retried })).toMatchObject({ path: '/concurrent-2' });

    const manualParent = async (mark: string, route = selected): Promise<string> => {
      const response = await request(route + '/pages', { ...content, mark, title: mark }, ownerCookie);
      const state = object(await response.json());

      expect(response.status, mark + ': ' + JSON.stringify(state)).toBe(201);

      return string(state.pageId);
    };
    const legacyPage = await manualParent('LegacyParent');
    const foreignPage = await manualParent('ForeignParent', '/sites/' + two);
    const virtualChild = await manualParent('VirtualChild');

    await urls.insertOne(toRecord(urlFixture({
      siteId: one, pageId: virtualChild, path: '/promo/offer', segment: 'offer',
    })));
    const promo = await draft('PromoDraft', 'en', 'Promo');
    const reservedPath = await draft('ReservedDraft', 'en', 'Admin');

    expect(await urls.findOne({ siteId: one, pageId: promo })).toMatchObject({ path: '/promo-2' });
    expect(await urls.findOne({ siteId: one, pageId: reservedPath })).toMatchObject({ path: '/admin-2' });

    const rejected = { ...content, mark: 'RejectedDraft', title: 'Rejected', h1: 'Rejected H1' };

    for (const [changes, status] of [
      [{ path: '/manual' }, 400],
      [{ urlPath: '/promo/forced' }, 400],
      [{ parentPageId: '/promo/' }, 400],
      [{ parentPageId: legacyPage }, 409],
      [{ parentPageId: foreignPage }, 404],
      [{ h1: '   ' }, 400],
      [{ h1: '😀' }, 400],
    ] as const) {
      expect(await request(pagesPath, { ...rejected, ...changes }, authorCookie)).toHaveProperty('status', status);
    }
    expect(await request(pagesPath + '?path=%2Fpromo%2Fforced', rejected, authorCookie))
      .toHaveProperty('status', 400);
    expect(await request(selected + '/urls/virtual', { kind: 'PAGE', pageId: parent, path: '/promo/' },
      authorCookie)).toHaveProperty('status', 403);
    const latestAccess = object(await (await request(selected + '/access', undefined, siteAdminCookie)).json());

    expect(await request(selected + '/access', {
      revision: latestAccess.revision,
      role: {
        roleId, key: 'draft-author', name: 'Draft author', description: 'Creates drafts', actorIds: [adminUserId],
      },
      actionIds: ['cms.pages.create', 'cms.publication.publish-page'],
    }, siteAdminCookie)).toHaveProperty('status', 200);
    expect(await request(pagesPath + '/' + legacyPage + '/publication', { path: '/manual' }, authorCookie))
      .toHaveProperty('status', 403);
    expect(await connection.collection('pages').countDocuments({ siteId: one, mark: rejected.mark })).toBe(0);
    expect(await urls.countDocuments({ siteId: one, path: { $in: ['/manual', '/promo/', '/promo/forced'] } })).toBe(0);

    const settingsPath = selected + '/settings';
    const settings = object(await (await request(settingsPath, undefined, siteAdminCookie)).json());
    const tables = Array.isArray(settings.transliteration) ? settings.transliteration.map(object) : [];
    const table = tables.find((item) => item.language === 'ru');
    const rules = Array.isArray(table?.rules) ? table.rules.map(object) : [];

    expect(rules).toContainEqual({ symbol: 'Ё', replacement: 'yo' });
    expect(settings.collapseTransliterationHyphens).toBe(true);
    const overrides = {
      transliteration: {
        language: 'ru',
        collapseHyphens: false,
        expectedCollapseHyphens: true,
        expectedRules: rules,
        rules: rules.map((rule) =>
          rule.symbol === 'Ё' ? { ...rule, replacement: 'jo' }
            : rule.symbol === ':' ? { ...rule, replacement: '' } : rule),
      },
    };

    expect(await request(settingsPath, undefined, authorCookie)).toHaveProperty('status', 403);
    expect(await request(settingsPath, overrides, authorCookie)).toHaveProperty('status', 403);
    expect(await request('/sites/' + two + '/settings', overrides, siteAdminCookie)).toHaveProperty('status', 403);
    const invalid = {
      transliteration: { ...overrides.transliteration, rules: [{ symbol: '/', replacement: '../' }, ...rules] },
    };

    expect(await request(settingsPath, invalid, siteAdminCookie)).toHaveProperty('status', 400);
    const invalidSpace = {
      transliteration: {
        ...overrides.transliteration,
        rules: rules.map((rule) => rule.symbol === ':' ? { ...rule, replacement: ' ' } : rule),
      },
    };

    expect(await request(settingsPath, invalidSpace, siteAdminCookie)).toHaveProperty('status', 400);
    expect(await request(settingsPath, overrides, siteAdminCookie)).toHaveProperty('status', 200);
    expect(await request(settingsPath, overrides, siteAdminCookie)).toHaveProperty('status', 409);
    const changedRules = await draft('WithOverrides', 'ru', 'Ёж:дом;чай---Мёд');

    expect(await urls.findOne({ siteId: one, pageId: changedRules })).toMatchObject({ path: '/jozhdomchay---myod' });
    expect(await urls.countDocuments({ siteId: one, path: '/yozh-shkola-chast-2' })).toBe(1);
    expect(await releases.countDocuments({ siteId: one })).toBe(initialReleases);
  }));
