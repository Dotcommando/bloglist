import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { account } from '../support/admin-users.js';
import { siteInput } from '../support/sites.js';

describe('deployment administration through real HTTP composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let origin: string;
  let connection: Connection;
  let local: INestApplicationContext;
  let app: INestApplication<Server>;
  let root = '';
  let base: string;
  let siteId: string;
  let cookie: string;

  async function request(route: string, body?: unknown): Promise<Response> {
    return fetch(base + '/api/admin/sites/' + siteId + '/deployment' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Host: new URL(origin).host,
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/deployment-http-'));
    const artifactsRoot = path.join(root, 'artifacts');
    const sourcesRoot = path.join(root, 'sites');

    local = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
      rendering: { sourcesRoot, artifactsRoot, loaders: [] },
    });
    siteId = (await local.get<ICreateSite>(CREATE_SITE).execute(siteInput())).siteId;
    const password = 'synthetic deployment password';
    const digest = await new ScryptAdminPasswordAdapter().hash(password);

    await new MongooseAdminUserStore(connection).run(async (users) => {
      await users.save(new AdminUser({ ...account('user-1').toState(), passwordDigest: digest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const reserved = probe.address();

    if (!reserved || typeof reserved === 'string') {
      throw new Error('Missing free test port');
    }
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    origin = 'http://127.0.0.1:' + reserved.port;
    app = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: reserved.port,
      artifactsRoot,
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
      sourcesRoot,
      loaders: [],
    });
    const address = app.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing isolated listener');
    }
    base = 'http://127.0.0.1:' + address.port;
    const login = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Host: new URL(origin).host, Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user-1@example.test', password }),
    });

    expect(login.status).toBe(200);
    cookie = login.headers.get('Set-Cookie')!.split(';')[0]!;
    await login.body?.cancel();
  });

  afterAll(async () => {
    await app?.close();
    await local?.close();

    if (connection?.name === database && /^zarya_test_[a-f0-9]{32}$/.test(database)) {
      await connection.dropDatabase();
      await connection.close();
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('configures guarded site targets and diagnoses them without provider credentials in HTTP', async () => {
    const empty = await request('');

    expect(await empty.json()).toMatchObject({ target: null, state: 'Idle' });
    const input = {
      expectedVersion: null,
      enabled: true,
      providerKey: 'cloudflare',
      destinationName: 'synthetic-site',
      publicOrigin: 'https://example.test',
      backendOrigin: origin,
    };
    const configured = await request('', input);

    expect(configured.status).toBe(200);
    const target = await configured.json();

    expect(target).toMatchObject({ siteId, enabled: true });
    expect((await request('', input)).status).toBe(409);
    expect((await request('', { ...input, actorId: 'operator' })).status).toBe(400);
    const check = await request('/check', {});

    expect(check.status).toBe(200);
    expect(await check.json()).toEqual({ diagnostics: [] });
    const status = await (await request('')).json();

    expect((await request('/retry', { expectedVersion: status.version })).status).toBe(409);
    const original = siteId;

    siteId = 'missing-site';
    expect((await request('')).status).toBe(404);
    siteId = original;
    expect((await request('', { ...input, expectedVersion: target.version, enabled: false })).status).toBe(200);
  });

  it('rejects unfinished unauthenticated bodies through the real dispatcher', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(base + '/api/admin/sites/' + siteId + '/deployment', {
        method: 'POST',
        headers: {
          Host: new URL(origin).host,
          Origin: origin,
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/json',
          'Content-Length': '999999999',
        },
      }, (response) => {
        response.resume();
        resolve(response.statusCode!);
        request.destroy();
      });

      request.on('error', reject);
      request.setTimeout(3000, () => request.destroy(new Error('Body was read before authentication')));
      request.flushHeaders();
    });

    expect(status).toBe(401);
  });
});
