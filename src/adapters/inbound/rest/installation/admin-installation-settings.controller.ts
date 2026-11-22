import type {
  IncomingMessage, ServerResponse,
} from 'node:http';

import type {
  IGetCurrentAdminUser,
} from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IChangeAdminAddress, IGetInstallationSettings,
} from '../../../../ports/inbound/installation/installation-settings.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';

export class AdminInstallationSettingsController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly get: IGetInstallationSettings, private readonly change: IChangeAdminAddress) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return pathname === '/api/admin/installation/settings';
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.canHandle(this.boundary.check(request, response))) {
        throw new HttpFailure(404, 'Not found');
      }

      const token = this.boundary.token(request);

      await this.current.execute({ token });

      if (request.method === 'GET') {
        sendJson(response, 200, await this.get.execute({ token }));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request);

      if (
        Object.keys(body).some((key) => !['adminAddress', 'expectedVersion'].includes(key))
        || typeof body.adminAddress !== 'string'
        || typeof body.expectedVersion !== 'string'
        || !body.expectedVersion
        || body.expectedVersion.length > 128
      ) {
        throw new HttpFailure(400, 'Invalid installation settings');
      }

      const result = await this.change.execute({
        token,
        adminAddress: body.adminAddress,
        expectedVersion: body.expectedVersion,
      });

      if (result.adminOrigin !== this.boundary.origin.origin) {
        this.boundary.cookie(response, '', new Date(0));
      }
      sendJson(response, 200, result);
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
