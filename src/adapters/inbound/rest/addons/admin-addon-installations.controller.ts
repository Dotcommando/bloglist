import type { IncomingMessage, ServerResponse } from 'node:http';

import type { IAddonInstallation } from '../../../../domain/addons/addon-installation.js';
import type { IInstallAddonFromRepository }
  from '../../../../ports/inbound/addons/install-addon-from-repository.port.js';
import type { IListAddonInstallations } from '../../../../ports/inbound/addons/list-addon-installations.port.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';

function summary(value: IAddonInstallation): Omit<IAddonInstallation, 'installedBy'> {
  return {
    installationId: value.installationId,
    addonKey: value.addonKey,
    repositoryUrl: value.repositoryUrl,
    releaseTag: value.releaseTag,
    sourceCommit: value.sourceCommit,
    artifactChecksum: value.artifactChecksum,
    runtimeDigest: value.runtimeDigest,
    implementationVersion: value.implementationVersion,
    cmsVersion: value.cmsVersion,
    status: value.status,
    createdAt: value.createdAt,
    installedAt: value.installedAt,
  };
}

export class AdminAddonInstallationsController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly install: IInstallAddonFromRepository, private readonly list: IListAddonInstallations) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/addon-installations(?:\/|$)/.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const match = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/addon-installations$/.exec(target);

      if (!match?.[1]) {
        throw new HttpFailure(400, 'Invalid installation route');
      }
      if (!['GET', 'POST'].includes(request.method ?? '')) {
        response.setHeader('Allow', 'GET, POST');
        throw new HttpFailure(405, 'Method not allowed');
      }

      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const input = { actorId: user.adminUserId, siteId: match[1] };

      if (request.method === 'GET') {
        sendJson(response, 200, { items: (await this.list.execute(input)).map(summary) });
      } else {
        const body = await readAdminBody(request, 8192);
        const { repositoryUrl, installedAddonKey } = body;

        if (
          Object.keys(body).some((key) => key !== 'repositoryUrl' && key !== 'installedAddonKey')
          || typeof repositoryUrl !== 'string'
          || !repositoryUrl
          || repositoryUrl.length > 2048
          || (installedAddonKey !== undefined
            && (typeof installedAddonKey !== 'string'
          || !/^[a-z][a-z0-9-]{0,63}$/.test(installedAddonKey)))
        ) {
          throw new HttpFailure(400, 'Invalid repository URL or installed add-on key');
        }
        sendJson(response, 200, summary(await this.install.execute({
          ...input,
          repositoryUrl,
          ...(installedAddonKey === undefined ? {} : { installedAddonKey }),
        })));
      }
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
