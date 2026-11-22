import type { IncomingMessage, ServerResponse } from 'node:http';

import { requireInstallationAdministrator } from '../../../../domain/admin-users/admin-user.policy.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IChangeInstallationResources, IGetInstallationResources } from
  '../../../../ports/inbound/resources/installation-resources.port.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson } from
  '../shared/admin-http.boundary.js';

export class AdminResourcesController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly get: IGetInstallationResources, private readonly change: IChangeInstallationResources) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return pathname === '/api/admin/installation/resources';
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.canHandle(this.boundary.check(request, response))) {
        throw new HttpFailure(404, 'Not found');
      }

      const token = this.boundary.token(request);

      requireInstallationAdministrator((await this.current.execute({ token })).user);

      if (request.method === 'GET') {
        sendJson(response, 200, await this.get.execute({ token }));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request, 65536);

      if (
        Object.keys(body).some((key) => !['expectedVersion', 'databaseCpu', 'sites',
          'sitePoolSize', 'cmsCpu'].includes(key))
        || typeof body.expectedVersion !== 'string'
        || body.expectedVersion.length > 128
        || typeof body.databaseCpu !== 'number'
        || !Number.isFinite(body.databaseCpu)
        || body.databaseCpu < 0
        || ('sitePoolSize' in body
        && (typeof body.sitePoolSize !== 'number'
          || !Number.isSafeInteger(body.sitePoolSize)
        || body.sitePoolSize < 1))
        || ('cmsCpu' in body
        && (typeof body.cmsCpu !== 'number'
        || !Number.isFinite(body.cmsCpu)
          || body.cmsCpu <= 0))
        || !Array.isArray(body.sites)
        || body.sites.some((entry: unknown) => !entry || typeof entry !== 'object'
          || Object.keys(entry).some((key) => !['siteId', 'processes'].includes(key))
          || !('siteId' in entry) || typeof entry.siteId !== 'string' || entry.siteId.length > 128
          || !('processes' in entry) || typeof entry.processes !== 'number'
          || !Number.isSafeInteger(entry.processes) || entry.processes < 1)
      ) {
        throw new HttpFailure(400, 'Invalid resource settings');
      }
      sendJson(response, 200, await this.change.execute({
        token,
        expectedVersion: body.expectedVersion,
        databaseCpu: body.databaseCpu,
        sites: body.sites,
        ...(typeof body.sitePoolSize === 'number' ? { sitePoolSize: body.sitePoolSize } : {}),
        ...(typeof body.cmsCpu === 'number' ? { cmsCpu: body.cmsCpu } : {}),
      }));
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
