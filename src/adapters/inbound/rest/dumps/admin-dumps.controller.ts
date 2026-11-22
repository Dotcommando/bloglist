import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { hasAdministratorGrant } from '../../../../domain/authorization/admin-authorization.js';
import { type ISiteDump, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  ICreateSiteDump, IDeleteSiteDump, IGetDumpExportItems, IGetSiteDump, IImportSiteDump, IInspectSiteDump,
  IListSiteDumps, IRestoreSiteDump,
} from '../../../../ports/inbound/dumps/site-dumps.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import { parseDumpApplication, parseDumpCreation } from './admin-dumps.parser.js';

export const maximumDumpUploadBytes = 16 * 1024 ** 3;

export interface IInstallationDumpOperations {
  create(siteId: string): Promise<ISiteDump>;
  open(filename: string): Promise<IBinaryContent>;
  restore(content: IBinaryContent): Promise<void>;
}

function archiveUpload(request: IncomingMessage): IBinaryContent {
  if (
    request.headers['content-type'] !== 'application/gzip'
    || request.headers['content-encoding'] !== undefined
    || typeof request.headers['content-length'] !== 'string'
    || !/^[1-9][0-9]*$/.test(request.headers['content-length'])
  ) {
    throw new HttpFailure(415, 'Gzip content with an explicit length is required');
  }

  const byteSize = Number(request.headers['content-length']);

  if (!Number.isSafeInteger(byteSize) || byteSize > maximumDumpUploadBytes) {
    throw new HttpFailure(413, 'Dump exceeds upload limit');
  }

  return { byteSize, mimeType: 'application/gzip', bytes: request };
}

async function download(response: ServerResponse, filename: string, content: IBinaryContent): Promise<void> {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/gzip');
  response.setHeader('Content-Length', content.byteSize);
  response.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  await pipeline(Readable.from(content.bytes), response);
}

export class AdminDumpsController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly create: ICreateSiteDump, private readonly list: IListSiteDumps,
    private readonly get: IGetSiteDump, private readonly importDump: IImportSiteDump,
    private readonly restore: IRestoreSiteDump, private readonly remove: IDeleteSiteDump,
    private readonly exportItems: IGetDumpExportItems, private readonly inspect: IInspectSiteDump,
    private readonly installation: IInstallationDumpOperations) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/dumps(?:\/|$)/.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const installation = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/dumps\/installation\/([A-Za-z0-9_.-]+)$/
        .exec(target);

      if (installation) {
        await this.handleInstallation(request, response, installation[1]!, installation[2]!);

        return;
      }

      const route = new RegExp('^/api/admin/sites/([A-Za-z0-9_-]{1,128})/dumps(?:/(create|import)'
        + '|/options/(Site|Snippets|Chunks|Templates|Addons|Files)|/([A-Za-z0-9_.-]+)'
        + '(?:/(inspect|restore|delete))?)?$');
      const match = route.exec(target);

      if (!match?.[1]) {
        throw new HttpFailure(400, 'Invalid dump route');
      }
      this.boundary.method(request, response, match[2] || ['restore',
        'delete'].includes(match[5] ?? '') ? 'POST' : 'GET');
      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const input = { siteId: match[1], actorId: user.adminUserId };

      if (match[2] === 'import') {
        sendJson(response, 201, await this.importDump.execute({
          ...input,
          content: archiveUpload(request),
        }));
      } else if (match[3]) {
        const type = Object.values(SiteDumpType).find((type) => type === match[3]);

        if (!type) {
          throw new HttpFailure(400, 'Invalid category');
        }
        sendJson(response, 200, await this.exportItems.execute({ ...input, type }));
      } else if (match[5] === 'inspect') {
        sendJson(response, 200, await this.inspect.execute({ ...input, filename: match[4]! }));
      } else if (match[2] === 'create' || match[5]) {
        const body = await readAdminBody(request, 4 * 1024 * 1024);

        if (match[2] === 'create') {
          const options = parseDumpCreation(body);

          sendJson(response, 201, await this.create.execute({ ...input, ...(options ? { options } : {}) }));
        } else if (match[5] === 'delete') {
          if (Object.keys(body).length) {
            throw new HttpFailure(400, 'Empty deletion body required');
          }
          await this.remove.execute({ ...input, filename: match[4]! });
          sendJson(response, 200, { deleted: true });
        } else {
          const options = parseDumpApplication(body);

          await this.restore.execute({ ...input, filename: match[4]!, ...(options ? { options } : {}) });
          sendJson(response, 200, { restored: true });
        }
      } else if (match[4]) {
        const dump = await this.get.execute({ ...input, filename: match[4] });

        await download(response, dump.filename, dump.content);
      } else {
        sendJson(response, 200, { items: await this.list.execute(input) });
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
      } else {
        this.boundary.failure(response, error);
      }
    }
  }

  private async handleInstallation(request: IncomingMessage, response: ServerResponse, siteId: string,
    operation: string): Promise<void> {
    const mutation = operation === 'create' || operation === 'restore';
    const action = mutation ? operation : 'download';

    this.boundary.method(request, response, mutation ? 'POST' : 'GET');
    const { user } = await this.current.execute({ token: this.boundary.token(request) });

    if (!user.authorization || !hasAdministratorGrant(user.authorization, 'cms.installation-dumps.' + action)) {
      throw new HttpFailure(403, 'Installation archive permission required');
    }
    if (operation === 'create') {
      if (Object.keys(await readAdminBody(request, 1024)).length) {
        throw new HttpFailure(400, 'Empty archive creation body required');
      }
      sendJson(response, 201, await this.installation.create(siteId));
    } else if (operation === 'restore') {
      await this.installation.restore(archiveUpload(request));
      sendJson(response, 200, { restored: true });
    } else {
      await download(response, operation, await this.installation.open(operation));
    }
  }
}
