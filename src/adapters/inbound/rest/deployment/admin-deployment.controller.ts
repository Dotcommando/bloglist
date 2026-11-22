import type { IncomingMessage, ServerResponse } from 'node:http';

import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  ICheckDeploymentTarget,
  IConfigureDeploymentTarget,
  IGetDeploymentStatus,
  IRetryDeployment,
} from '../../../../ports/inbound/deployment/deployment.port.js';
import {
  AdminHttpBoundary,
  HttpFailure,
  type IAdminHttpSettings,
  readAdminBody,
  sendJson,
} from '../shared/admin-http.boundary.js';

export interface IDeploymentConfigurationFactory {
  forSession(token: string | null): IConfigureDeploymentTarget;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048) {
    throw new HttpFailure(400, 'Invalid deployment field');
  }

  return value;
}

export class AdminDeploymentController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly status: IGetDeploymentStatus, private readonly configure: IDeploymentConfigurationFactory,
    private readonly retry: IRetryDeployment, private readonly check: ICheckDeploymentTarget) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/deployment(?:\/|$)/.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const route = this.boundary.check(request, response);
      const match = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/deployment(?:\/(retry|check))?$/.exec(route);

      if (!match) {
        throw new HttpFailure(400, 'Invalid deployment route');
      }

      const token = this.boundary.token(request);
      const { user } = await this.current.execute({ token });
      const actor = { siteId: match[1]!, actorId: user.adminUserId };

      if (request.method === 'GET' && !match[2]) {
        sendJson(response, 200, await this.status.execute(actor));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request);
      const allowed = match[2] === 'check' ? [] : match[2] === 'retry' ? ['expectedVersion']
        : ['expectedVersion', 'enabled', 'providerKey', 'destinationName', 'publicOrigin', 'backendOrigin'];

      if (Object.keys(body).some((key) => !allowed.includes(key))) {
        throw new HttpFailure(400, 'Unknown deployment field');
      }
      if (match[2] === 'check') {
        sendJson(response, 200, { diagnostics: await this.check.execute(actor) });
      } else if (match[2] === 'retry') {
        sendJson(response, 200, await this.retry.execute({ ...actor, expectedVersion: string(body.expectedVersion) }));
      } else {
        if (typeof body.enabled !== 'boolean') {
          throw new HttpFailure(400, 'Invalid enabled flag');
        }
        sendJson(response, 200, await this.configure.forSession(token).execute({
          ...actor,
          expectedVersion: body.expectedVersion === null ? null : string(body.expectedVersion),
          enabled: body.enabled,
          providerKey: string(body.providerKey),
          destinationName: string(body.destinationName),
          publicOrigin: string(body.publicOrigin),
          backendOrigin: string(body.backendOrigin),
        }));
      }
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
