import { writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import { expect, it } from 'vitest';

import { account } from '../support/admin-users.js';
import { forkHarness } from '../support/fork-harness.js';

it('denies resource mutations without a live session through real composition', async () => {
  const f = await forkHarness({ admin: true });

  try {
    const before = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));
    const privateMarker = 'synthetic-private-resource-credential';

    await writeFile(path.join(f.root, '.env'), privateMarker);

    for (const target of ['/.env', '/../.env', '/%2e%2e/.env', '/assets/%2e%2e/.env',
      '/dumps/.coordination/processes/allocation.json']) {
      const response = await f.read(f.sites[0]!.host, target);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain(privateMarker);
    }
    const payloads = [
      { databaseCpu: before.databaseCpu, sites: before.sites.map((site) => ({ ...site, processes: 4 })) },
      { databaseCpu: before.databaseCpu, sites: before.sites, sitePoolSize: 20 },
      { databaseCpu: 2, sites: before.sites },
    ].map((value) => ({ expectedVersion: before.version, ...value }));
    const send = (payload: unknown, cookie?: string, target = '/api/admin/installation/resources'): Promise<Response> =>
      fetch(f.origin + target, {
        method: 'POST',
        headers: {
          Origin: f.origin,
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(payload),
      });

    for (const payload of payloads) {
      for (const cookie of [undefined, 'zarya_admin_session=forged', 'zarya_admin_ui_session=forged']) {
        const response = await send(payload, cookie);

        expect(response.status).toBe(401);
        await response.arrayBuffer();
      }
    }
    const unfinished = await new Promise<number>((resolve, reject) => {
      const req = request(f.origin + '/api/admin/installation/resources', {
        method: 'POST',
        agent: false,
        headers: {
          Origin: f.origin,
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/json',
          'Content-Length': 1073741824,
        },
      }, (response) => {
        response.resume();
        response.once('end', () => {
          resolve(response.statusCode!);
          req.destroy();
        });
        response.once('error', reject);
      });

      req.once('error', reject);
      req.setTimeout(3000, () => req.destroy(new Error('Authentication waited for upload')));
      req.flushHeaders();
    });

    expect(unfinished).toBe(401);

    for (const target of ['/api/admin/installation/%72esources', '/api//admin/installation/resources',
      '/api/admin/installation/resources?deep[__proto__][polluted]=true', '/api/admin/installation/resources/']) {
      const response = await send(payloads[0], undefined, target);

      expect(response.status).toBeGreaterThanOrEqual(400);
      await response.arrayBuffer();
    }
    const login = await fetch(f.origin + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: f.origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account().profile().email, password: 'synthetic fork password' }),
    });

    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');

    await login.arrayBuffer();
    const authorized = await fetch(f.origin + '/api/admin/installation/resources', { headers: { Cookie: cookie } });

    expect(authorized.status).toBe(200);
    await authorized.arrayBuffer();
    const logout = await fetch(f.origin + '/api/admin/auth/logout', {
      method: 'POST',
      headers: { Origin: f.origin, 'X-Zarya-Admin': '1', Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect([200, 204]).toContain(logout.status);
    await logout.arrayBuffer();

    for (const payload of payloads) {
      const response = await send(payload, cookie);

      expect(response.status).toBe(401);
      await response.arrayBuffer();
    }
    const after = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));

    expect(after.version).toBe(before.version);
    expect(after.sites).toEqual(before.sites);
    expect(after.databasePools).toEqual(before.databasePools);
    expect(after.databaseCpu).toBe(before.databaseCpu);
    expect(after.running).toEqual(before.running);
    const worker = f.supervisor.pool.select(f.sites[0]!.siteId);
    const privatePort = worker.port;

    expect((await f.read(f.sites[0]!.host, '/probe/', privatePort)).status).toBe(403);
  } finally {
    await f.close();
  }
}, 90000);
