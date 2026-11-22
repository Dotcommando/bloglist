import type { IncomingMessage, ServerResponse } from 'node:http';

import { validateJsonLdCatalog } from '../../../../domain/json-ld/json-ld-catalog.js';
import type { IListJsonLdCatalog, ISaveJsonLdCatalog } from '../../../../ports/inbound/json-ld/json-ld-catalog.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';

export interface IAdminJsonLdFactory {
  forSession(token: string | null): { readonly list: IListJsonLdCatalog; readonly save: ISaveJsonLdCatalog };
}

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/json-ld$/;

export class AdminJsonLdController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminJsonLdFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const match = route.exec(this.boundary.check(request, response));

      if (!match) {
        throw new HttpFailure(400, 'Invalid JSON-LD route');
      }

      const siteId = match[1]!;
      const operations = this.operations.forSession(this.boundary.token(request));

      if (request.method === 'GET') {
        sendJson(response, 200, await operations.list.execute({ siteId }));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request, 1024 * 1024);

      if (
        Object.keys(body).some((key) => !['expectedVersion', 'profiles', 'objects'].includes(key))
        || typeof body.expectedVersion !== 'string'
        || !body.expectedVersion.length
      ) {
        throw new HttpFailure(400, 'Invalid JSON-LD fields');
      }

      const catalog: unknown = {
        siteId, version: body.expectedVersion, profiles: body.profiles, objects: body.objects,
      };

      validateJsonLdCatalog(catalog);
      sendJson(response, 200, await operations.save.execute({
        siteId, expectedVersion: catalog.version, profiles: catalog.profiles, objects: catalog.objects,
      }));
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
