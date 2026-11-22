import type { IncomingMessage, ServerResponse } from 'node:http';

import { BuiltInRoleId } from '../../../../domain/authorization/built-in-roles.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import type { IAdminUserOperationFactory } from './admin-user-operations.factory.js';

const USERS_ROUTE = /^\/api\/admin\/users(?:\/([A-Za-z0-9_-]{1,128})\/(password|block|delete))?$/;

function fields(body: Record<string, unknown>, allowed: readonly string[]): void {
  if (
    Object.keys(body).some((key) => !allowed.includes(key))
    || allowed.some((key) => key !== 'blocked' && typeof body[key] !== 'string')
  ) {
    throw new HttpFailure(400, 'Validation');
  }
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw new HttpFailure(400, 'Validation');
  }

  return value;
}

export class AdminUsersController {
  private readonly boundary: AdminHttpBoundary;
  private passwordChanges = 0;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminUserOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return pathname === '/api/admin/users' || pathname.startsWith('/api/admin/users/');
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let admitted = false;

    try {
      const target = this.boundary.check(request, response);
      const url = new URL(target, this.boundary.origin);
      const match = USERS_ROUTE.exec(url.pathname);

      if (!match) {
        throw new HttpFailure(404, 'NotFound');
      }

      const adminUserId = match[1];
      const action = match[2];

      if (request.method !== 'POST' && (request.method !== 'GET' || adminUserId)) {
        response.setHeader('Allow', adminUserId ? 'POST' : 'GET, POST');
        throw new HttpFailure(405, 'Method not allowed');
      }

      const operations = await this.operations.forSession(this.boundary.token(request));
      const actorId = operations.actorId;

      if (request.method === 'GET') {
        for (const key of url.searchParams.keys()) {
          if (!['limit', 'cursor'].includes(key) || url.searchParams.getAll(key).length !== 1) {
            throw new HttpFailure(400, 'Validation');
          }
        }
        const limit = url.searchParams.get('limit');

        if (limit !== null && (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100)) {
          throw new HttpFailure(400, 'Validation');
        }

        const result = await operations.list.execute({
          actorId, ...(limit === null ? {} : { limit: Number(limit) }), cursor: url.searchParams.get('cursor'),
        });

        sendJson(response, 200, { ...result, currentAdminUserId: actorId });

        return;
      }
      if (url.search) {
        throw new HttpFailure(400, 'Validation');
      }
      if (!adminUserId || action === 'password') {
        if (this.passwordChanges >= 2) {
          response.setHeader('Retry-After', '1');
          throw new HttpFailure(429, 'TooManyAttempts');
        }
        this.passwordChanges++;
        admitted = true;
      }

      const body = await readAdminBody(request);

      if (!adminUserId) {
        const explicitRole = Object.hasOwn(body, 'roleId') || Object.hasOwn(body, 'siteId');

        fields(body, explicitRole ? ['email', 'password', 'roleId', 'siteId'] : ['email', 'password']);
        const roleId = typeof body.roleId === 'string' && (
          Object.values<string>(BuiltInRoleId).includes(body.roleId)
          || /^[a-f0-9-]{36}$/.test(body.roleId)
        ) ? body.roleId : undefined;
        const siteId = body.siteId;

        if (
          explicitRole
          && (
            !roleId
          || roleId === BuiltInRoleId.SystemAdmin
          && siteId !== null
          || roleId !== BuiltInRoleId.SystemAdmin
          && (typeof siteId !== 'string'
          || !/^[A-Za-z0-9_-]{1,128}$/.test(siteId))
          )
        ) {
          throw new HttpFailure(400, 'Validation');
        }
        sendJson(response, 201, await operations.create.execute({
          actorId,
          email: text(body, 'email'),
          password: text(body, 'password'),
          ...(roleId ? { assignment: { roleId, siteId: typeof siteId === 'string' ? siteId : null } } : {}),
        }));

        return;
      }

      const common = { actorId, adminUserId, expectedVersion: text(body, 'expectedVersion') };

      if (action === 'block') {
        fields(body, ['expectedVersion', 'blocked']);

        if (typeof body.blocked !== 'boolean') {
          throw new HttpFailure(400, 'Validation');
        }
        sendJson(response, 200, await operations.block.execute({ ...common, blocked: body.blocked }));

        return;
      }

      const currentSessionInvalidated = adminUserId === actorId;

      if (action === 'password') {
        fields(body, ['expectedVersion', 'password']);
        const user = await operations.update.execute({ ...common, password: text(body, 'password') });

        if (currentSessionInvalidated) {
          this.boundary.cookie(response, '', new Date(0));
        }
        sendJson(response, 200, { user, currentSessionInvalidated });
      } else {
        fields(body, ['expectedVersion']);
        const result = await operations.remove.execute(common);

        if (currentSessionInvalidated) {
          this.boundary.cookie(response, '', new Date(0));
        }
        sendJson(response, 200, { ...result, currentSessionInvalidated });
      }
    } catch (error) {
      this.boundary.failure(response, error);
    } finally {
      if (admitted) {
        this.passwordChanges--;
      }
    }
  }
}
