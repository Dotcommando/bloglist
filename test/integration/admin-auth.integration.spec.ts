import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createServer } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { AdminAuthSecretsAdapter } from '../../src/adapters/outbound/security/admin-auth/admin-auth-values.adapter.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { BlockAdminUserUseCase } from '../../src/app/use-cases/admin-users/block-admin-user.use-case.js';
import { DeleteAdminUserUseCase } from '../../src/app/use-cases/admin-users/delete-admin-user.use-case.js';
import { UpdateAdminUserUseCase } from '../../src/app/use-cases/admin-users/update-admin-user.use-case.js';
import { AdminAuthSession } from '../../src/domain/admin-auth/admin-auth-session.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import {
  ADMIN_USER_ACCESS, CREATE_ADMIN_USER_FROM_CONSOLE,
} from '../../src/infra/admin-users/admin-users.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { account } from '../support/admin-users.js';
import { adminFixture } from '../support/admin-users.js';

describe('administrator authentication through REST and isolated MongoDB', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let origin: string;
  const password = 'synthetic integration password';
  let connection: Connection;
  let app: INestApplication<Server>;
  let store: MongooseAdminUserStore;
  let digest: string;
  let base: string;

  async function request(route: string, body?: unknown, cookie?: string): Promise<Response> {
    return fetch(base + '/api/admin/auth' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    store = new MongooseAdminUserStore(connection);
    digest = await new ScryptAdminPasswordAdapter().hash(password);
    const probe = createServer();

    await new Promise<void>((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const reserved = probe.address();

    if (!reserved || typeof reserved === 'string') {
      throw new Error('Missing free test port');
    }
    await new Promise<void>((resolve, reject) => {
      probe.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    origin = 'http://127.0.0.1:' + reserved.port;
    app = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: reserved.port,
      artifactsRoot: 'artifacts',
      adminAuth: { origin },
    });
    const address = app.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener');
    }
    base = 'http://127.0.0.1:' + address.port;
  });
  it('throttles rotating unknown emails from the same socket source through real HTTP and persistence', async () => {
    for (let index = 0; index < 12; index++) {
      const response = await request('/login', { email: 'attack' + index + '@example.test', password: 'wrong' });

      expect(response.status).toBe(index < 9 ? 401 : 429);
    }
    const source = await connection.collection<{ _id: string; failures: number; blockedUntil: Date | null }>(
      'admin_login_attempts')
      .findOne({ _id: new AdminAuthSecretsAdapter().sourceKey('127.0.0.1') });

    expect(source?.failures).toBe(10);
    expect(source?.blockedUntil).toBeInstanceOf(Date);
  });

  beforeEach(async () => {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe test database');
    }

    for (const name of ['role_assignments', 'admin_users', 'admin_auth_sessions', 'admin_login_attempts']) {
      await connection.collection(name).deleteMany({});
    }
    await store.run(async (users) => {
      for (const id of ['user-1', 'user-2']) {
        await users.save(new AdminUser({ ...account(id).toState(), passwordDigest: digest }), null);
      }
    });
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
  });
  it('logs in through real composition, stores hashes and exposes no local-operator privileges', async () => {
    const response = await request('/login', { email: ' USER-1@EXAMPLE.TEST ', password });

    expect(response.status).toBe(200);
    const body: unknown = await response.json();

    expect(body).toMatchObject({ user: { adminUserId: 'user-1' }, session: { current: true } });
    expect(body).not.toHaveProperty('token');
    const cookie = response.headers.get('Set-Cookie');

    expect(cookie).toContain('HttpOnly');
    const row = await connection.collection('admin_auth_sessions').findOne({});

    expect(row?.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(row).not.toHaveProperty('token');
    expect(cookie).not.toContain(String(row?.tokenDigest));
    expect(() => app.get(ADMIN_USER_ACCESS)).toThrow();
    expect(() => app.get(CREATE_ADMIN_USER_FROM_CONSOLE)).toThrow();
    await verifyMigrations(connection, 'migrations');
  });
  it('keeps a browser login after restoring persistent cookies without exposing it to page scripts', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser executable required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(origin + '/api/admin/auth/me');
      const status = await page.evaluate(async (credentials) => {
        const response = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Zarya-Admin': '1' },
          body: JSON.stringify(credentials),
        });

        return response.status;
      }, { email: 'user-1@example.test', password });

      expect(status).toBe(200);
      const cookie = (await context.cookies()).find((candidate) => candidate.name === 'zarya_admin_session');

      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/admin' });
      expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(58 * 24 * 3600);
      expect(await page.evaluate(() => document.cookie)).not.toContain('zarya_admin_session');
      const storageState = await context.storageState();

      await context.close();
      const restored = await browser.newContext({ storageState });
      const restoredPage = await restored.newPage();
      const response = await restoredPage.goto(origin + '/api/admin/auth/me');

      expect(response?.status()).toBe(200);
      expect(await response?.json()).toMatchObject({ user: { adminUserId: 'user-1' } });
      await restored.close();
    } finally {
      await browser.close();
    }
  });
  it('logs out one device while preserving another and allows repeated logout', async () => {
    const first = await request('/login', { email: 'user-1@example.test', password });
    const second = await request('/login', { email: 'user-1@example.test', password });
    const cookie = first.headers.get('Set-Cookie')?.split(';')[0];

    expect((await request('/logout', {}, cookie)).status).toBe(204);
    expect((await request('/logout', {}, cookie)).status).toBe(204);
    expect(await connection.collection('admin_auth_sessions').countDocuments({ revokedAt: null })).toBe(1);
    expect(second.headers.get('Set-Cookie')).not.toBe(first.headers.get('Set-Cookie'));
    expect((await request('/me', undefined, cookie)).status).toBe(401);
    expect((await request('/me', undefined, second.headers.get('Set-Cookie')?.split(';')[0])).status).toBe(200);
  });
  it('reads the current account and rejects expired sessions independently of TTL deletion', async () => {
    expect((await request('/me')).status).toBe(401);
    const logged = await request('/login', { email: 'user-1@example.test', password });
    const cookie = logged.headers.get('Set-Cookie')?.split(';')[0];

    expect((await request('/me', undefined, cookie)).status).toBe(200);
    await connection.collection('admin_auth_sessions').updateMany({}, {
      $set: {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastSeenAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-02-01T00:00:00Z'),
      },
    });
    expect((await request('/me', undefined, cookie)).status).toBe(401);
  });
  it('lists only own active devices, paginates tied timestamps and binds cursors to their owner', async () => {
    const a = await request('/login', { email: 'user-1@example.test', password });

    await request('/login', { email: 'user-1@example.test', password });
    const b = await request('/login', { email: 'user-2@example.test', password });
    const cookie = a.headers.get('Set-Cookie')?.split(';')[0];

    await connection.collection('admin_auth_sessions').updateMany({}, {
      $set: { createdAt: new Date('2026-10-24T10:00:00Z') },
    });
    const first: unknown = await (await request('/sessions?limit=1', undefined, cookie)).json();

    if (!first || typeof first !== 'object' || !('nextCursor' in first) || typeof first.nextCursor !== 'string') {
      throw new Error('Missing session cursor');
    }
    expect(first).toHaveProperty('items');
    const second = await request('/sessions?limit=1&cursor=' + first.nextCursor, undefined, cookie);

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ nextCursor: null });
    const foreign = await request('/sessions?cursor=' + first.nextCursor, undefined,
      b.headers.get('Set-Cookie')?.split(';')[0]);

    expect(foreign.status).toBe(400);
    const all: unknown = await (await request('/sessions', undefined, cookie)).json();

    expect(all).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ current: true })]) });
    expect(JSON.stringify(all)).not.toContain('tokenDigest');
  });
  it('revokes only owned devices, supports concurrent idempotent revocation and clears self revocation', async () => {
    const first = await request('/login', { email: 'user-1@example.test', password });
    const second = await request('/login', { email: 'user-1@example.test', password });
    const foreign = await request('/login', { email: 'user-2@example.test', password });
    const a = first.headers.get('Set-Cookie')?.split(';')[0];
    const b = second.headers.get('Set-Cookie')?.split(';')[0];
    const other: unknown = await second.json();
    const own: unknown = await first.json();
    const stranger: unknown = await foreign.json();

    function sessionId(body: unknown): string {
      if (
        body
        && typeof body === 'object'
        && 'session' in body
        && body.session
        && typeof body.session === 'object'
        && 'sessionId' in body.session
        && typeof body.session.sessionId === 'string'
      ) {
        return body.session.sessionId;
      }
      throw new Error('Missing session ID');
    }
    expect((await request('/sessions/' + sessionId(stranger) + '/revoke', {}, a)).status).toBe(404);
    const responses = await Promise.all([1, 2].map(() => request('/sessions/' + sessionId(other) + '/revoke', {}, a)));

    expect(responses.map((r) => r.status)).toEqual([204, 204]);
    expect((await request('/me', undefined, b)).status).toBe(401);
    expect((await request('/me', undefined, a)).status).toBe(200);
    const self = await request('/sessions/' + sessionId(own) + '/revoke', {}, a);

    expect(self.status).toBe(204);
    expect(self.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await request('/me', undefined, a)).status).toBe(401);
  });
  it.each(['email', 'password', 'block', 'delete'])('invalidates every device after %s changes', async (change) => {
    const first = await request('/login', { email: 'user-1@example.test', password });
    const second = await request('/login', { email: 'user-1@example.test', password });
    const a = first.headers.get('Set-Cookie')?.split(';')[0];
    const b = second.headers.get('Set-Cookie')?.split(';')[0];
    const local = adminFixture();
    const values = { ...local.values, now: () => new Date() };
    const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1' };

    if (change === 'email' || change === 'password') {
      const update = new UpdateAdminUserUseCase(store, local.access, new ScryptAdminPasswordAdapter(), values);

      expect((await update.execute({ ...input, email: ' USER-1@EXAMPLE.TEST ', allowedSiteIds: [] })).version)
        .toBe(input.expectedVersion);
      expect((await request('/me', undefined, a)).status).toBe(200);
      await update.execute({
        ...input,
        ...(change === 'email' ? { email: 'changed@example.test' }
          : { password: 'synthetic new integration password' }),
      });
    } else if (change === 'block') {
      const block = new BlockAdminUserUseCase(store, local.access, values);
      const blocked = await block.execute({ ...input, blocked: true });

      expect((await request('/me', undefined, a)).status).toBe(401);
      await block.execute({ ...input, expectedVersion: blocked.version, blocked: false });
    } else {
      await new DeleteAdminUserUseCase(store, local.access, values).execute(input);
    }
    expect((await request('/me', undefined, a)).status).toBe(401);
    expect((await request('/me', undefined, b)).status).toBe(401);
    expect((await request('/sessions', undefined, a)).status).toBe(401);

    if (change === 'password') {
      expect((await request('/login', { email: 'user-1@example.test', password })).status).toBe(401);
      const changed = await request('/login', {
        email: 'user-1@example.test', password: 'synthetic new integration password',
      });

      expect(changed.status).toBe(200);
    }
  });
  it('counts parallel failures without lost updates, returns Retry-After and expires the pause logically', async () => {
    const responses: Response[] = [];

    // Keep each concurrent pair within the HTTP password-work admission budget.
    // Excess simultaneous requests are correctly rejected before counting attempts.
    for (let pair = 0; pair < 5; pair++) {
      responses.push(...await Promise.all(Array.from({ length: 2 }, (_, index) => request('/login', {
        email: index % 2 ? ' USER-1@EXAMPLE.TEST ' : 'user-1@example.test', password: 'wrong',
      }))));
    }

    expect(responses.filter((r) => r.status === 401)).toHaveLength(9);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(1);
    const blocked = await request('/login', { email: 'user-1@example.test', password });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(890);
    expect(await connection.collection('admin_auth_sessions').countDocuments()).toBe(0);
    const attempts = connection.collection('admin_login_attempts');
    const counter = await attempts.findOne({});

    expect(counter?.failures).toBe(10);
    expect(counter).not.toHaveProperty('email');
    await attempts.updateMany({}, { $set: { blockedUntil: new Date(Date.now() - 1000) } });
    expect((await request('/login', { email: 'user-1@example.test', password })).status).toBe(200);
    expect(await attempts.countDocuments()).toBe(0);
  });
  it('rolls back session creation and counter clearing together on a transaction failure', async () => {
    const secrets = new AdminAuthSecretsAdapter();
    const key = secrets.loginKey('user-1@example.test');
    const at = new Date();
    const attempt = {
      loginKey: key,
      failures: 1,
      windowStartedAt: at,
      blockedUntil: null,
      expiresAt: new Date(at.getTime() + 900000),
    };

    await store.runAuth(async (tx) => {
      await tx.saveLoginAttempt(attempt);
    });
    await expect(store.runAuth(async (tx) => {
      const issued = secrets.issue();

      await tx.createSession(new AdminAuthSession({
        sessionId: randomUUID(),
        adminUserId: 'user-1',
        accountVersion: 'user-1-v1',
        tokenDigest: issued.tokenDigest,
        createdAt: at,
        lastSeenAt: at,
        expiresAt: new Date(at.getTime() + 900000),
        revokedAt: null,
        clientAddress: null,
        userAgent: null,
      }));
      await tx.clearLoginAttempt(key);
      const user = await tx.findByEmail('user-1@example.test');

      expect(user?.profile().email).toBe('user-1@example.test');
      throw new Error('Injected transaction failure');
    })).rejects.toThrow('Injected transaction failure');
    expect(await connection.collection('admin_login_attempts').countDocuments()).toBe(1);
    expect(await connection.collection('admin_auth_sessions').countDocuments()).toBe(0);
    await verifyMigrations(connection, 'migrations');
    const sessions = connection.collection('admin_auth_sessions');

    await expect(sessions.insertOne({ invalid: 'shape' })).rejects.toMatchObject({ code: 121 });
  });
});
