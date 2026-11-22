import 'reflect-metadata';

import {
  randomUUID,
} from 'node:crypto';
import {
  mkdir, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import {
  request, type Server,
} from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type {
  INestApplication,
} from '@nestjs/common';
import {
  type Connection, createConnection,
} from 'mongoose';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import {
  MongooseInstallationSettingsStore,
} from '../../src/adapters/outbound/persistence/mongoose/installation/installation-settings-store.adapter.js';
import {
  applyMigrations, verifyMigrations,
} from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import {
  AdminUser,
} from '../../src/domain/admin-users/admin-user.js';
import {
  BusinessError, BusinessErrorCode,
} from '../../src/domain/shared/business-error.js';
import { ADDON_PACKAGE_REGISTRY } from '../../src/infra/addons/addons.tokens.js';
import {
  ADMIN_ADDRESS_REACHABILITY,
} from '../../src/infra/installation/installation.tokens.js';
import {
  createPublicHttpApplication,
} from '../../src/infra/public-http.application.js';
import type {
  IAdminAddressReachabilityPort,
} from '../../src/ports/outbound/installation/installation-settings-store.port.js';
import {
  account,
} from '../support/admin-users.js';
import { legacyAdminAddon } from '../support/legacy-admin-addon.js';

describe('installation address through real HTTP and isolated persistence', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplication<Server>;
  let root: string;
  let base: string;
  let store: MongooseInstallationSettingsStore;
  const password = 'synthetic installation password';

  async function start(): Promise<void> {
    app = await createPublicHttpApplication({
      mongoUri: process.env.ZARYA_TEST_MONGO_URI!,
      database,
      host: '127.0.0.1',
      port: 0,
      artifactsRoot: path.join(root, 'artifacts'),
      sourcesRoot: path.join(root, 'sources'),
      dumpsRoot: path.join(root, 'dumps'),
      adminRoot: path.join(root, 'admin'),
      adminAuth: { origin: 'http://localhost' },
    });
    const address = app.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('No listener');
    }
    base = 'http://127.0.0.1:' + address.port;
  }
  async function send(host: string, route: string, body?: unknown, cookie?: string): Promise<{
    status: number; headers: Record<string, string | string[] | undefined>; body: string;
  }> {
    return new Promise((resolve, reject) => {
      const outgoing = request(base + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Host: host,
          Origin: host === 'localhost' ? 'http://localhost' : 'https://' + host,
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      }, (incoming) => {
        let text = '';

        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => {
          text += chunk;
        });
        incoming.on('error', reject);
        incoming.on('end', () => resolve({
          status: incoming.statusCode ?? 500,
          headers: incoming.headers,
          body: text,
        }));
      });

      outgoing.on('error', reject);
      outgoing.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  function cookieOf(headers: Record<string, string | string[] | undefined>): string {
    const value = headers['set-cookie'];

    if (!Array.isArray(value) || !value[0]) {
      throw new Error('No session cookie');
    }

    return value[0].split(';')[0]!;
  }
  beforeAll(async () => {
    if (!process.env.ZARYA_TEST_MONGO_URI) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-installation-integration-'));

    await mkdir(path.join(root, 'admin/.vite'), { recursive: true });
    await mkdir(path.join(root, 'admin/assets'));
    await writeFile(path.join(root, 'admin/index.html'), '<html>Administration</html>');
    await writeFile(path.join(root, 'admin/assets/entry.js'), '');
    await writeFile(path.join(root, 'admin/.vite/manifest.json'), JSON.stringify({
      'index.html': { file: 'assets/entry.js', isEntry: true },
    }));
    connection = await createConnection(process.env.ZARYA_TEST_MONGO_URI, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    store = new MongooseInstallationSettingsStore(connection);
    const digest = await new ScryptAdminPasswordAdapter().hash(password);
    const user = new AdminUser({ ...account().toState(), passwordDigest: digest });

    await new MongooseAdminUserStore(connection).run(async (tx) => tx.save(user, null));
    await start();
    const runtime = path.join(root, 'legacy-addon');

    await legacyAdminAddon(runtime);
    await app.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).install(runtime);
  });
  afterAll(async () => {
    await app?.close();

    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
    await rm(root, { recursive: true, force: true });
  });
  it('keeps a valid login when a legacy runtime forwards the versioned cookie', async () => {
    const logged = await send('localhost', '/api/admin/auth/login', { email: 'user-1@example.test', password });
    const cookie = cookieOf(logged.headers);
    const result = await send('localhost', '/api/admin/synthetic/legacy-session', undefined, cookie);

    expect(result.status).toBe(200);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(JSON.parse(result.body)).toMatchObject({ user: { adminUserId: 'user-1' } });
    expect((await send('localhost', '/api/admin/auth/me', undefined, cookie)).status).toBe(200);
    const rawToken = cookie.slice(cookie.indexOf('.') + 1);
    const unversioned = 'zarya_admin_session=' + rawToken;
    const foreign = 'zarya_admin_session=foreign-version.' + rawToken;

    for (const invalid of [unversioned, foreign]) {
      expect((await send('localhost', '/api/admin/synthetic/legacy-session', undefined, invalid)).status).toBe(401);
    }
    await app.close();
    await start();
    expect((await send('localhost', '/api/admin/synthetic/legacy-session', undefined, cookie)).status).toBe(200);
  });
  it('authenticates before body consumption and switches origin, cookies and redirects without a restart', async () => {
    const denied = await new Promise<number>((resolve, reject) => {
      const outgoing = request(base + '/api/admin/installation/settings', {
        method: 'POST',
        headers: {
          Host: 'localhost',
          Origin: 'http://localhost',
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/json',
          'Content-Length': '100000000',
        },
      }, (incoming) => {
        incoming.resume();
        resolve(incoming.statusCode ?? 500);
      });

      outgoing.on('error', reject);
      outgoing.flushHeaders();
    });

    expect(denied).toBe(401);
    const logged = await send('localhost', '/api/admin/auth/login', { email: 'user-1@example.test', password });

    expect(logged.status).toBe(200);
    const oldCookie = cookieOf(logged.headers);
    const initial = await store.read();
    const get = await send('localhost', '/api/admin/installation/settings', undefined, oldCookie);

    expect(get.status).toBe(200);
    expect(JSON.parse(get.body)).toEqual(initial);
    const verify = vi.spyOn(app.get<IAdminAddressReachabilityPort>(ADMIN_ADDRESS_REACHABILITY), 'verify');

    verify.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Validation, 'Synthetic unreachable address'));
    const change = { adminAddress: 'https://new.example.com/admin/', expectedVersion: initial.version };

    expect((await send('localhost', '/api/admin/installation/settings', change, oldCookie)).status).toBe(400);
    expect(await store.read()).toEqual(initial);
    verify.mockResolvedValue();
    const changed = await send('localhost', '/api/admin/installation/settings', change, oldCookie);

    expect(changed.status).toBe(200);
    const installed = await store.read();

    expect(installed.adminOrigin).toBe('https://new.example.com');
    expect(installed.previousOrigin).toBe('http://localhost');
    expect((await send('localhost', '/api/admin/auth/me', undefined, oldCookie)).status).toBe(403);
    expect((await send('new.example.com', '/api/admin/installation/settings', undefined, oldCookie)).status).toBe(401);
    const redirect = await send('localhost', '/admin/sites?view=all');

    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe('https://new.example.com/admin/sites?view=all');
    expect((await send('foreign.example.com', '/admin/')).status).toBe(403);
    expect((await send('localhost', '/api/health')).status).toBe(200);
    const newLogin = await send('new.example.com', '/api/admin/auth/login', { email: 'user-1@example.test', password });
    const newCookie = cookieOf(newLogin.headers);

    expect(newLogin.status).toBe(200);
    expect(newLogin.headers['set-cookie']).toEqual([
      expect.stringMatching(/^zarya_admin_session=.*; Path=\/api\/admin;.*; Secure;/),
      expect.stringMatching(/^zarya_admin_ui_session=.*; Path=\/admin;.*; Secure;/),
    ]);
    expect((await send('new.example.com', '/api/admin/installation/settings', undefined, newCookie)).status).toBe(200);
    await app.close();
    await start();
    expect(await store.read()).toEqual(installed);
    expect((await send('new.example.com', '/api/admin/installation/settings', undefined, newCookie)).status).toBe(200);
    const rejectedLogin = await send('localhost', '/api/admin/auth/login', { email: 'user-1@example.test', password });

    expect(rejectedLogin.status).toBe(403);
    await verifyMigrations(connection, 'migrations');
  });
  it('serializes concurrent initialization and compare-and-set updates in the singleton', async () => {
    await Promise.all([store.initialize('https://ignored.example.com'), store.initialize('https://other.example.com')]);
    const before = await store.read();
    const outcomes = await Promise.allSettled([
      store.changeAdminOrigin('https://one.example.com', before.version),
      store.changeAdminOrigin('https://two.example.com', before.version),
    ]);

    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: BusinessErrorCode.StaleWrite }) }),
    ]);
    expect(await connection.collection('installation_settings').countDocuments()).toBe(1);
    expect(await store.probeKey()).toMatch(/^[a-f0-9]{64}$/);
  });
});
