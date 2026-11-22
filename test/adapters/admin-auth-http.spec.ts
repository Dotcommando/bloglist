import { createServer, type Server } from 'node:http';

import { createCloudflareWorker } from '../../src/adapters/inbound/gateway/cloudflare/worker.js';
import { applyTrustedEdgeProxy } from '../../src/adapters/inbound/gateway/http/edge-proxy.boundary.js';
import { AdminAuthController } from '../../src/adapters/inbound/rest/admin-auth/admin-auth.controller.js';
import { AdminAuthContextService } from '../../src/app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../src/app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import { ListAdminAuthSessionsUseCase } from '../../src/app/use-cases/admin-auth/list-admin-auth-sessions.use-case.js';
import { LoginAdminUserUseCase } from '../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { LogoutAdminUserUseCase } from '../../src/app/use-cases/admin-auth/logout-admin-user.use-case.js';
import {
  RevokeAdminAuthSessionUseCase,
} from '../../src/app/use-cases/admin-auth/revoke-admin-auth-session.use-case.js';
import { authFixture, loginInput } from '../support/admin-auth.js';

describe('administrator authentication REST translation', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const f = authFixture();

    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Missing test listener');
    }
    base = 'http://127.0.0.1:' + address.port;
    const controller = new AdminAuthController({ origin: base },
      new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values),
      new LogoutAdminUserUseCase(f.work, f.secrets, f.values),
      new GetCurrentAdminUserUseCase(f.work, new AdminAuthContextService(f.secrets), f.values),
      new ListAdminAuthSessionsUseCase(f.work, new AdminAuthContextService(f.secrets), f.values),
      new RevokeAdminAuthSessionUseCase(f.work, new AdminAuthContextService(f.secrets), f.values));

    server.on('request', (request, response) => {
      applyTrustedEdgeProxy(request, 'synthetic-edge-secret');
      void controller.handle(request, response);
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      server.closeAllConnections();
    });
  });
  it('sets a persistent private cookie and never serializes its secret in JSON', async () => {
    const response = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginInput.email, password: loginInput.password }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toMatch(/HttpOnly; SameSite=Strict/);
    expect(response.headers.get('Set-Cookie')).toContain('Expires=');
    expect(response.headers.get('Set-Cookie')).toContain('Path=/api/admin');
    const cookies = response.headers.getSetCookie();

    expect(cookies).toHaveLength(2);
    expect(cookies[1]).toMatch(/^zarya_admin_ui_session=[^;]+; Path=\/admin; HttpOnly; SameSite=Strict/);
    expect(cookies[1]).toContain('Expires=');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).not.toHaveProperty('token');
  });
  it('signs in, reads the session and logs out through the Cloudflare gateway', async () => {
    const originFetch = globalThis.fetch;

    vi.spyOn(globalThis, 'fetch').mockImplementation((request) => originFetch(request));
    const worker = createCloudflareWorker({
      publicOrigin: base,
      backendOrigin: base,
      mediaPath: '/assets',
      requestPaths: [],
      staticPolicies: {},
    });
    const env = {
      ASSETS: { fetch: vi.fn() },
      ZARYA_EDGE_PROXY_SECRET: 'synthetic-edge-secret',
    };
    const headers = { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };
    const response = await worker.fetch(new Request(base + '/api/admin/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: loginInput.email, password: loginInput.password }),
    }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).not.toHaveProperty('token');
    const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!;
    const current = await worker.fetch(new Request(base + '/api/admin/auth/me', {
      headers: { Cookie: cookie },
    }), env);

    expect(current.status).toBe(200);
    expect(current.headers.getSetCookie()).toHaveLength(1);
    expect(current.headers.getSetCookie()[0]).toMatch(/^zarya_admin_ui_session=[^;]+; Path=\/admin;/);
    const logout = await worker.fetch(new Request(base + '/api/admin/auth/logout', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: '{}',
    }), env);

    expect(logout.status).toBe(204);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(logout.headers.getSetCookie()).toHaveLength(2);
    expect(logout.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
    expect((await worker.fetch(new Request(base + '/api/admin/auth/me', {
      headers: { Cookie: cookie },
    }), env)).status).toBe(401);

    for (const unsafe of [
      { Origin: base },
      { Origin: base, 'X-Zarya-Admin': 'wrong' },
      { Origin: 'https://foreign.test', 'X-Zarya-Admin': '1' },
    ]) {
      const rejected = await worker.fetch(new Request(base + '/api/admin/auth/login', {
        method: 'POST',
        headers: { ...unsafe, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginInput.email, password: loginInput.password }),
      }), env);

      expect(rejected.status).toBe(403);
      expect(rejected.headers.has('Set-Cookie')).toBe(false);
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('logs out idempotently and clears the persistent cookie', async () => {
    const response = await fetch(base + '/api/admin/auth/logout', {
      method: 'POST',
      headers: { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await response.text()).toBe('');
  });
  it('requires authentication for current-user reads and clears a rejected cookie', async () => {
    const response = await fetch(base + '/api/admin/auth/me');

    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
  it('rejects repeated and unknown session-list query parameters', async () => {
    expect((await fetch(base + '/api/admin/auth/sessions?limit=1&limit=2')).status).toBe(400);
    expect((await fetch(base + '/api/admin/auth/sessions?adminUserId=foreign')).status).toBe(400);
    expect((await fetch(base + '/api/admin/auth/sessions?limit=20')).status).toBe(401);
  });
  it('authenticates session revocation and rejects unsafe request targets', async () => {
    const response = await fetch(base + '/api/admin/auth/sessions/unknown/revoke', {
      method: 'POST',
      headers: { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(401);
    expect((await fetch(base + '/api/admin/auth/sessions/%2F/revoke', {
      method: 'POST',
      headers: { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: '{}',
    })).status).toBe(400);
  });
  it('rejects cross-origin, missing CSRF headers, unknown JSON fields and oversized bodies', async () => {
    for (const headers of [{ Origin: 'https://foreign.test', 'X-Zarya-Admin': '1' }, { Origin: base }]) {
      const response = await fetch(base + '/api/admin/auth/login', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(response.status).toBe(403);
    }
    const headers = { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };
    const unknown = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...loginInput, actorId: 'operator' }),
    });

    expect(unknown.status).toBe(400);
    const large = await fetch(base + '/api/admin/auth/login', { method: 'POST', headers, body: ' '.repeat(8193) });

    expect(large.status).toBe(413);
  });
});
