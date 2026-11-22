import type { IncomingMessage, ServerResponse } from 'node:http';

import type { IAddonWorkspaceView } from '@zarya/addon-contracts/addons';

import { hasAdministratorGrant, type IAdminAuthorization }
  from '../../../../domain/authorization/admin-authorization.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import type { IGetAddonRuntimeAsset, IGetAddonRuntimeView }
  from '../../../../ports/inbound/addons/addon-runtime-assets.port.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import { writeFileResponse } from '../../shared/file-response.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, sendJson } from '../shared/admin-http.boundary.js';

interface IAddonWorkspaces {
  list(siteId: string, actorId: string, authorization: IAdminAuthorization): Promise<readonly IAddonWorkspaceView[]>;
  read(addonKey: string, digest: string, path: string): Promise<IBinaryContent>;
  timeZone(siteId: string): Promise<string | null>;
}

export class AdminAddonRuntimeController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly view: IGetAddonRuntimeView, private readonly asset: IGetAddonRuntimeAsset,
    private readonly workspaces?: IAddonWorkspaces) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/(?:addon-runtime\/|addon-workspaces(?:\/|$))/.test(pathname);
  }

  private async sendAsset(response: ServerResponse, content: IBinaryContent): Promise<void> {
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', content.byteSize);

    await writeFileResponse(response, content.bytes);
    response.end();
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const workspacePath = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/addon-workspaces(?:\/([a-z][a-z0-9-]{0,63})\/([a-f0-9]{64})\/([A-Za-z0-9_./-]+))?$/.exec(target);

      if (workspacePath && this.workspaces) {
        this.boundary.method(request, response, 'GET');
        const { user } = await this.current.execute({ token: this.boundary.token(request) });
        const siteId = workspacePath[1]!;
        const authority = user.authorization;

        if (!authority || !(authority.systemAdmin || authority.siteIds.includes(siteId))) {
          throw new HttpFailure(403, 'Add-on workspace is outside the assigned site');
        }

        const available = await this.workspaces.list(siteId, user.adminUserId, authority);

        if (!workspacePath[2]) {
          const timeZone = available.length ? await this.workspaces.timeZone(siteId) : null;

          sendJson(response, 200, { items: available, timeZone });
        } else {
          const item = available.find((view) => view.addonKey === workspacePath[2] && view.digest === workspacePath[3]);

          if (!item) {
            throw new HttpFailure(403, 'Add-on workspace is outside the assigned authority');
          }

          await this.sendAsset(response, await this.workspaces.read(item.addonKey, item.digest, workspacePath[4]!));
        }

        return;
      }

      const route = new RegExp('^/api/admin/sites/([A-Za-z0-9_-]{1,128})/addon-runtime/'
        + '([a-z][a-z0-9-]{0,63})(?:/([a-f0-9]{64})/([A-Za-z0-9_./-]+))?$');
      const match = route.exec(target);

      if (!match?.[1] || !match[2]) {
        throw new HttpFailure(400, 'Invalid runtime route');
      }
      this.boundary.method(request, response, 'GET');
      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const action = match[3] ? 'cms.addon-runtime.read-asset' : 'cms.addon-runtime.read-view';

      if (!user.authorization || !hasAdministratorGrant(user.authorization, action, match[1])) {
        throw new HttpFailure(403, 'Add-on screen is outside the assigned authority');
      }

      const input = { siteId: match[1], addonKey: match[2], actorId: user.adminUserId };

      if (!match[3]) {
        const view = await this.view.execute(input);

        sendJson(response, 200, view);
      } else {
        const content = await this.asset.execute({ ...input, digest: match[3], asset: match[4]! });

        await this.sendAsset(response, content);
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
      } else {
        this.boundary.failure(response, error);
      }
    }
  }
}
