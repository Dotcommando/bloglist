import { createServer, request } from 'node:http';

import { expect, it, type Mock, vi } from 'vitest';

import { AdminResourcesController } from '../../src/adapters/inbound/rest/resources/admin-resources.controller.js';
import type { ICurrentAdminUser } from '../../src/domain/admin-auth/admin-auth-session.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { currentAdmin } from '../support/current-admin.js';

interface IResourceBoundary {
  origin: string;
  send(headers?: Record<string, string | readonly string[]>, body?: string, unfinished?: boolean,
    method?: string, target?: string): Promise<{ status: number; body: string }>;
  reads: Mock<() => Promise<never>>;
  writes: Mock<() => Promise<never>>;
  auth: Mock<(input: { token: string | null }) => Promise<ICurrentAdminUser>>;
  consumed(): number;
  profile(value: ICurrentAdminUser): void;
  close(): Promise<void>;
}

async function boundary(): Promise<IResourceBoundary> {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing synthetic listener');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  let profile = currentAdmin();
  const reads = vi.fn(async () => {
    throw new Error('Synthetic private diagnostic');
  });
  const writes = vi.fn(async () => {
    throw new Error('Synthetic private diagnostic');
  });
  const auth = vi.fn(async ({ token }: { token: string | null }) => {
    if (token !== 'valid') {
      throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Session required');
    }

    return profile;
  });
  const controller = new AdminResourcesController({ origin },
    { execute: auth }, { execute: reads }, { execute: writes });
  let consumed = 0;

  server.on('request', (incoming, response) => {
    const original = incoming[Symbol.asyncIterator].bind(incoming);

    incoming[Symbol.asyncIterator] = () => {
      consumed++;

      return original();
    };
    void controller.handle(incoming, response).catch(() => response.destroy());
  });
  const send = (headers: Record<string, string | readonly string[]> = {}, body?: string, unfinished = false,
    method = 'POST', target = '/api/admin/installation/resources'):
  Promise<{ status: number; body: string }> => new Promise((resolve, reject) => {
    const req = request(origin + target, {
      method,
      headers: Object.entries({
        Host: new URL(origin).host,
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        ...(unfinished ? { 'Content-Length': '1073741824' } : {}),
        ...headers,
      }).flatMap(([key, value]) => (typeof value === 'string' ? [value] : value).flatMap((item) => [key, item])),
      agent: false,
    }, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString() });
        req.destroy();
      });
    });

    req.once('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Authorization waited for an unfinished body')));

    if (unfinished) {
      req.flushHeaders();
    } else {
      req.end(body);
    }
  });

  return {
    origin,
    send,
    reads,
    writes,
    auth,
    consumed: () => consumed,
    profile: (value: typeof profile) => {
      profile = value;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it('denies anonymous and forged identities before reading an unfinished resource mutation', async () => {
  const f = await boundary();

  try {
    for (const headers of [
      {},
      { Cookie: 'zarya_admin_session=forged' },
      { Cookie: 'zarya_admin_ui_session=valid' },
      { Authorization: 'Bearer valid' },
      { 'X-Zarya-Process-Secret': 'valid', 'X-Forwarded-User': 'admin' },
      { Cookie: 'litespeed_role=1; litespeed_hash=valid' },
    ]) {
      expect((await f.send(headers, undefined, true)).status).toBe(401);
    }
    expect(f.consumed()).toBe(0);
    expect(f.reads).not.toHaveBeenCalled();
    expect(f.writes).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it('rejects cross-origin, ambiguous and oversized credentials without invoking resource operations', async () => {
  const f = await boundary();

  try {
    for (const [headers, status] of [
      [{ Origin: 'https://foreign.test' }, 403],
      [{ Origin: '' }, 403],
      [{ Origin: 'null' }, 403],
      [{ Host: 'foreign.test', 'X-Forwarded-Host': new URL(f.origin).host }, 403],
      [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
      [{ 'X-Zarya-Admin': '' }, 403],
      [{ Origin: [f.origin, f.origin] }, 400],
      [{ Cookie: ['zarya_admin_session=valid', 'other=1'] }, 400],
      [{ Cookie: 'zarya_admin_session=valid; zarya_admin_session=valid' }, 400],
      [{ Cookie: 'zarya_admin_session=' + 'x'.repeat(4096) }, 400],
    ] as const) {
      expect((await f.send({ Cookie: 'zarya_admin_session=valid', ...headers }, undefined, true)).status).toBe(status);
    }
    expect(f.consumed()).toBe(0);
    expect(f.writes).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it.each(['blocked', 'site-scoped'])('requires an active installation administrator for %s profiles', async (kind) => {
  const f = await boundary();
  const profile = currentAdmin();

  f.profile({
    ...profile,
    user: {
      ...profile.user,
      ...(kind === 'blocked' ? { blocked: true }
        : { authorization: { systemAdmin: false, siteIds: ['one'], siteAdminSiteIds: ['one'] } }),
    },
  });

  try {
    expect((await f.send({ Cookie: 'zarya_admin_session=valid' }, undefined, false, 'GET')).status).toBe(403);
    expect((await f.send({ Cookie: 'zarya_admin_session=valid' }, undefined, true)).status).toBe(403);
    expect(f.consumed()).toBe(0);
    expect(f.reads).not.toHaveBeenCalled();
    expect(f.writes).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it('rejects prototype keys and invalid numeric budgets before translation and remains usable afterwards', async () => {
  const f = await boundary();
  const valid = '{"expectedVersion":"v1","databaseCpu":1,"sitePoolSize":5,"sites":[{"siteId":"one","processes":2}]}';

  try {
    for (const key of ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf']) {
      for (const body of [valid.replace('{', '{"' + key + '":{},'),
        valid.replace('"processes":2', '"processes":2,"' + key + '":{}')]) {
        expect((await f.send({ Cookie: 'zarya_admin_session=valid' }, body)).status).toBe(400);
      }
    }

    for (const body of [valid.replace('"databaseCpu":1', '"databaseCpu":1e309'),
      valid.replace('"databaseCpu":1', '"databaseCpu":-1'),
      valid.replace('"databaseCpu":1', '"databaseCpu":1,"cmsCpu":1e309'),
      valid.replace('"databaseCpu":1', '"databaseCpu":1,"cmsCpu":0'),
      valid.replace('"processes":2', '"processes":0'),
      valid.replace('"processes":2', '"processes":9007199254740992')]) {
      expect((await f.send({ Cookie: 'zarya_admin_session=valid' }, body)).status).toBe(400);
    }
    expect(f.writes).not.toHaveBeenCalled();
    expect(Object.prototype.toString.call({})).toBe('[object Object]');
    expect(Object.prototype.valueOf.call({})).toEqual({});
    const accepted = await f.send({ Cookie: 'zarya_admin_session=valid' }, valid);

    expect(accepted.status).toBe(500);
    expect(accepted.body).not.toContain('private diagnostic');
    expect(f.writes).toHaveBeenCalledExactlyOnceWith({
      token: 'valid', expectedVersion: 'v1', databaseCpu: 1, sitePoolSize: 5, sites: [{ siteId: 'one', processes: 2 }],
    });
  } finally {
    await f.close();
  }
});
