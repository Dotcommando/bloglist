import { ContentRequestError, object, string } from '../../shared/api/content-api';
import type { IAdminUser, IAdminUserList } from './admin-users.types';
import { AdminUserAction } from './admin-users.types';

async function request(route: string, body?: unknown): Promise<unknown> {
  const response = await fetch('/api/admin/users' + route, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-Zarya-Admin': '1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const value: unknown = await response.json();

  if (!response.ok) {
    throw new ContentRequestError(response.status,
      value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
        ? value.error : 'RequestFailed');
  }

  return value;
}

function user(value: unknown): IAdminUser {
  const row = object(value);

  if (typeof row.blocked !== 'boolean') {
    throw new Error('Invalid account state');
  }

  return {
    adminUserId: string(row.adminUserId),
    email: string(row.email),
    blocked: row.blocked,
    version: string(row.version),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
  };
}

export async function listAdminUsers(cursor: string | null = null): Promise<IAdminUserList> {
  const row = object(await request(cursor === null ? '' : '?cursor=' + encodeURIComponent(cursor)));

  if (!Array.isArray(row.items)) {
    throw new Error('Invalid administrator list');
  }

  return {
    items: row.items.map(user),
    nextCursor: row.nextCursor === null ? null : string(row.nextCursor),
    currentAdminUserId: string(row.currentAdminUserId),
  };
}

export async function createAdminUser(email: string, password: string,
  assignment: { roleId: string; siteId: string | null }): Promise<IAdminUser> {
  return user(await request('', { email, password, ...assignment }));
}

export async function changeAdminUser(action: AdminUserAction, target: IAdminUser, password: string):
Promise<{ readonly user: IAdminUser | null; readonly currentSessionInvalidated: boolean }> {
  const route = '/' + encodeURIComponent(target.adminUserId);
  const body = { expectedVersion: target.version };

  if (action === AdminUserAction.Password) {
    const row = object(await request(route + '/password', { ...body, password }));

    return { user: user(row.user), currentSessionInvalidated: row.currentSessionInvalidated === true };
  }
  if (action === AdminUserAction.Delete) {
    const row = object(await request(route + '/delete', body));

    return { user: null, currentSessionInvalidated: row.currentSessionInvalidated === true };
  }

  return {
    user: user(await request(route + '/block', { ...body, blocked: action === AdminUserAction.Block })),
    currentSessionInvalidated: false,
  };
}
