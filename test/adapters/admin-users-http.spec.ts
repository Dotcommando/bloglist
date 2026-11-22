import { createServer, type Server } from 'node:http';

import type {
  IAdminUserOperations,
} from '../../src/adapters/inbound/rest/admin-users/admin-user-operations.factory.js';
import { AdminUsersController } from '../../src/adapters/inbound/rest/admin-users/admin-users.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { account } from '../support/admin-users.js';

describe('administrator REST boundary', () => {
  let server: Server;
  let base: string;
  let operations: IAdminUserOperations;

  beforeEach(async () => {
    const user = account().profile();

    operations = {
      actorId: 'user-1',
      create: { execute: vi.fn(async () => user) },
      list: { execute: vi.fn(async () => ({ items: [user], nextCursor: 'next' })) },
      update: { execute: vi.fn(async () => user) },
      block: { execute: vi.fn(async () => user) },
      remove: {
        execute: vi.fn(async () => ({
          adminUserId: user.adminUserId, deletedAt: new Date('2026-11-05T00:00:00Z'), version: 'v2',
        })),
      },
    };
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('No address');
    }
    base = 'http://127.0.0.1:' + address.port;
    const controller = new AdminUsersController({ origin: base }, {
      forSession: async (token) => {
        if (token !== 'trusted') {
          throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Session required');
        }

        return operations;
      },
    });

    server.on('request', (request, response) => {
      void controller.handle(request, response);
    });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function request(route = '', body?: unknown, token = 'trusted', origin = base): Promise<Response> {
    return fetch(base + '/api/admin/users' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        Cookie: 'zarya_admin_session=' + token,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  it('authenticates before reading a body and rejects caller-controlled actors and site assignments', async () => {
    expect((await request('', { password: 'x'.repeat(9000) }, 'invalid')).status).toBe(401);
    expect(operations.create.execute).not.toHaveBeenCalled();
    expect((await request('', {
      email: 'new@example.test',
      password: 'synthetic password',
      actorId: 'forged',
    })).status).toBe(400);
    expect((await request('', {
      email: 'new@example.test',
      password: 'synthetic password',
      allowedSiteIds: ['site-1'],
    })).status).toBe(400);
    expect((await request('', {}, 'trusted', 'https://foreign.test')).status).toBe(403);
  });
  it('translates safe creation, listing and explicit mutations with trusted actor and version', async () => {
    const listed = await request('?limit=1&cursor=opaque');

    expect(await listed.json()).toMatchObject({ currentAdminUserId: 'user-1', nextCursor: 'next' });
    expect(operations.list.execute).toHaveBeenCalledWith({ actorId: 'user-1', limit: 1, cursor: 'opaque' });
    expect((await request('', { email: 'new@example.test', password: 'synthetic password' })).status).toBe(201);
    expect(operations.create.execute).toHaveBeenCalledWith({
      actorId: 'user-1', email: 'new@example.test', password: 'synthetic password',
    });
    expect((await request('/user-2/block', { expectedVersion: 'v1', blocked: true })).status).toBe(200);
    expect(operations.block.execute).toHaveBeenCalledWith({
      actorId: 'user-1', adminUserId: 'user-2', expectedVersion: 'v1', blocked: true,
    });
    expect((await request('/user-2/delete', { expectedVersion: 'v1' })).status).toBe(200);
    expect(operations.remove.execute).toHaveBeenCalledWith({
      actorId: 'user-1', adminUserId: 'user-2', expectedVersion: 'v1',
    });
  });
  it('expires the session after changing its own password and keeps other account changes in the session', async () => {
    const own = await request('/user-1/password', { expectedVersion: 'v1', password: 'synthetic password' });

    expect(await own.json()).toMatchObject({ currentSessionInvalidated: true });
    expect(own.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(operations.update.execute).toHaveBeenCalledWith({
      actorId: 'user-1', adminUserId: 'user-1', expectedVersion: 'v1', password: 'synthetic password',
    });
    const other = await request('/user-2/password', { expectedVersion: 'v1', password: 'synthetic password' });

    expect(await other.json()).toMatchObject({ currentSessionInvalidated: false });
    expect(other.headers.get('set-cookie')).toBeNull();
  });
  it('bounds concurrent password work without queueing and releases admission after completion', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.mocked(operations.create.execute).mockImplementation(async () => {
      await barrier;

      return account().profile();
    });
    const body = { email: 'new@example.test', password: 'synthetic password' };
    const pending = Promise.allSettled([request('', body), request('', body)]);
    const failures: unknown[] = [];

    try {
      await vi.waitFor(() => expect(operations.create.execute).toHaveBeenCalledTimes(2));
      const third = await request('', body);

      expect(third.status).toBe(429);
      expect(third.headers.get('retry-after')).toBe('1');
      expect(operations.create.execute).toHaveBeenCalledTimes(2);
    } catch (error) {
      failures.push(error);
    } finally {
      release();
    }
    const responses = await pending;

    for (const result of responses) {
      if (result.status === 'rejected') {
        failures.push(result.reason);
      }
    }

    if (failures.length) {
      throw new AggregateError(failures, 'Concurrent test requests failed');
    }
    expect(responses.map((result) => result.status === 'fulfilled' ? result.value.status : null)).toEqual([201, 201]);
    expect((await request('', body)).status).toBe(201);
  });
  it('rejects malformed bodies and query parameters and translates domain conflicts safely', async () => {
    for (const suffix of ['?limit=101', '?limit=0', '?limit=1&limit=2', '?siteId=foreign']) {
      expect((await request(suffix)).status).toBe(400);
    }
    expect((await request('/user-2/block', { expectedVersion: 'v1', blocked: 'yes' })).status).toBe(400);
    expect((await request('/user-2/password', { expectedVersion: 'v1', password: 'p', email: 'x' })).status).toBe(400);
    expect((await request('', { email: 'x', password: 'x'.repeat(9000) })).status).toBe(413);
    vi.mocked(operations.remove.execute).mockRejectedValueOnce(
      new BusinessError(BusinessErrorCode.LastAdministrator, 'Private detail'),
    );
    const result = await request('/user-2/delete', { expectedVersion: 'v1' });

    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: 'LastAdministrator' });
  });
});
