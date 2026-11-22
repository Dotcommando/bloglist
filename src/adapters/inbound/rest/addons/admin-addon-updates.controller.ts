import type { IncomingMessage, ServerResponse } from 'node:http';

import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ICheckAddonRepositoryUpdate }
  from '../../../../ports/inbound/addons/check-addon-repository-update.port.js';
import type { IGetAddonUpdate } from '../../../../ports/inbound/addons/get-addon-update.port.js';
import type { IPrepareAddonUpdate } from '../../../../ports/inbound/addons/prepare-addon-update.port.js';
import type { IUpdateAddon } from '../../../../ports/inbound/addons/update-addon.port.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, sendJson } from '../shared/admin-http.boundary.js';

export interface IAddonUpdateCommands {
  actorId(actionId?: string): Promise<string>;
  readonly checkRepository: ICheckAddonRepositoryUpdate;
  readonly prepare: IPrepareAddonUpdate;
  readonly apply: IUpdateAddon;
  readonly read: IGetAddonUpdate;
}

export class AdminAddonUpdatesController {
  private readonly boundary: AdminHttpBoundary;
  private readonly active = new Set<Promise<PromiseSettledResult<void>[]>>();
  private closing = false;

  constructor(settings: IAdminHttpSettings, private readonly commands: (token: string | null) => IAddonUpdateCommands) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/addon-updates(?:\/|$)/.test(pathname);
  }

  async drain(): Promise<void> {
    this.closing = true;
    await Promise.all(this.active);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const work = this.dispatch(request, response);
    const observed = Promise.allSettled([work]);

    this.active.add(observed);

    try {
      await work;
    } finally {
      this.active.delete(observed);
    }
  }

  private async dispatch(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let authenticated = false;

    try {
      if (this.closing) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'CMS is closing');
      }

      const target = this.boundary.check(request, response);
      const match = /^\/api\/admin\/addon-updates(?:\/([a-f0-9-]{36})(\/apply)?)?$/.exec(target);
      const repository = /^\/api\/admin\/addon-updates\/repository\/([a-z][a-z0-9-]{0,63})$/.exec(target);

      if (!match && !repository) {
        throw new HttpFailure(400, 'Invalid update route');
      }

      const commands = this.commands(this.boundary.token(request));
      const actorId = await commands.actorId(repository ? 'cms.addons.check-update' : undefined);

      authenticated = true;

      if (repository?.[1] && request.method === 'POST') {
        if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] ?? 0) !== 0) {
          throw new HttpFailure(400, 'Repository update check does not accept a body');
        }
        sendJson(response, 200, await commands.checkRepository.execute({ actorId, addonKey: repository[1] }));
      } else if (match && request.method === 'GET' && match[1] && !match[2]) {
        sendJson(response, 200, await commands.read.execute({ actorId, updateId: match[1] }));
      } else if (match && request.method === 'POST' && !match[1]) {
        const byteSize = Number(request.headers['content-length']);

        if (
          request.headers['content-type'] !== 'application/gzip'
          || !Number.isSafeInteger(byteSize)
          || byteSize < 1
          || byteSize > 64 * 1024 ** 2
        ) {
          throw new HttpFailure(400, 'A gzip archive with a valid Content-Length is required');
        }
        sendJson(response, 200, await commands.prepare.execute({
          actorId,
          content: {
            byteSize, mimeType: 'application/gzip', bytes: request,
          },
        }));
      } else if (match && request.method === 'POST' && match[1] && match[2]) {
        if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] ?? 0) !== 0) {
          throw new HttpFailure(400, 'Apply does not accept a body');
        }

        sendJson(response, 200, await commands.apply.execute({ actorId, updateId: match[1] }));
      } else {
        response.setHeader('Allow', match?.[1] && !match[2] ? 'GET' : 'POST');
        throw new HttpFailure(405, 'Method not allowed');
      }
    } catch (error) {
      if (!authenticated) {
        response.shouldKeepAlive = false;
        response.setHeader('Connection', 'close');
      }
      this.boundary.failure(response, error);
    }
  }
}
