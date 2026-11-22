import type { IncomingMessage, ServerResponse } from 'node:http';

import { AdminLoginThrottledError } from '../../../../domain/admin-auth/admin-auth.policy.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IListAdminAuthSessions } from '../../../../ports/inbound/admin-auth/list-admin-auth-sessions.port.js';
import type { ILoginAdminUser } from '../../../../ports/inbound/admin-auth/login-admin-user.port.js';
import type { ILogoutAdminUser } from '../../../../ports/inbound/admin-auth/logout-admin-user.port.js';
import type { IRevokeAdminAuthSession } from '../../../../ports/inbound/admin-auth/revoke-admin-auth-session.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';

export type IAdminAuthHttpSettings = IAdminHttpSettings;

export { ADMIN_AUTH_COOKIE } from '../shared/admin-http.boundary.js';

export class AdminAuthController {
  private readonly boundary: AdminHttpBoundary;
  private activeLogins = 0;

  constructor(settings: IAdminAuthHttpSettings, private readonly login: ILoginAdminUser,
    private readonly logout: ILogoutAdminUser, private readonly current: IGetCurrentAdminUser,
    private readonly sessions: IListAdminAuthSessions, private readonly revoke: IRevokeAdminAuthSession) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let admitted = false;

    try {
      const target = this.boundary.check(request, response);
      const url = new URL(target, this.boundary.origin);
      const revokeMatch = /^\/api\/admin\/auth\/sessions\/([A-Za-z0-9_-]{1,128})\/revoke$/.exec(target);

      if (revokeMatch?.[1]) {
        this.boundary.method(request, response, 'POST');

        if (Object.keys(await readAdminBody(request)).length) {
          throw new HttpFailure(400, 'Empty JSON object required');
        }

        const result = await this.revoke.execute({ token: this.boundary.token(request), sessionId: revokeMatch[1] });

        if (result.currentSessionRevoked) {
          this.boundary.cookie(response, '', new Date(0));
        }
        response.statusCode = 204;
        response.end();

        return;
      }
      if (url.pathname === '/api/admin/auth/sessions') {
        this.boundary.method(request, response, 'GET');

        for (const key of url.searchParams.keys()) {
          if (!['limit', 'cursor'].includes(key) || url.searchParams.getAll(key).length !== 1) {
            throw new HttpFailure(400, 'Invalid session-list parameters');
          }
        }
        const limit = url.searchParams.get('limit');

        if (limit !== null && !/^[1-9][0-9]{0,2}$/.test(limit)) {
          throw new HttpFailure(400, 'Invalid list limit');
        }
        sendJson(response, 200, await this.sessions.execute({
          token: this.boundary.token(request),
          ...(limit === null ? {} : { limit: Number(limit) }),
          cursor: url.searchParams.get('cursor'),
        }));

        return;
      }
      if (target === '/api/admin/auth/me') {
        this.boundary.method(request, response, 'GET');
        const token = this.boundary.token(request);
        const current = await this.current.execute({ token });

        this.boundary.uiCookie(response, token!, current.session.expiresAt);
        sendJson(response, 200, current);

        return;
      }
      if (target === '/api/admin/auth/logout') {
        this.boundary.method(request, response, 'POST');

        if (Object.keys(await readAdminBody(request)).length) {
          throw new HttpFailure(400, 'Empty JSON object required');
        }
        await this.logout.execute({ token: this.boundary.token(request) });
        this.boundary.cookie(response, '', new Date(0));
        response.statusCode = 204;
        response.end();

        return;
      }
      if (target !== '/api/admin/auth/login') {
        throw new HttpFailure(404, 'Endpoint not found');
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request);

      if (
        Object.keys(body).some((key) => !['email', 'password'].includes(key))
        || typeof body.email !== 'string'
        || typeof body.password !== 'string'
      ) {
        throw new HttpFailure(400, 'Email and password are required');
      }
      if (this.activeLogins >= 2) {
        throw new AdminLoginThrottledError(1);
      }
      this.activeLogins++;
      admitted = true;
      const result = await this.login.execute({
        email: body.email,
        password: body.password,
        clientAddress: request.socket.remoteAddress ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });

      this.boundary.cookie(response, result.token, result.session.expiresAt);
      sendJson(response, 200, { user: result.user, session: result.session });
    } catch (error) {
      this.boundary.failure(response, error);
    } finally {
      if (admitted) {
        this.activeLogins--;
      }
    }
  }
}
