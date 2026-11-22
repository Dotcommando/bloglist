import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  validateTemplateValues,
  validateTemplateVariables,
} from '../../../../domain/template-variables/template-variable.js';
import type {
  ITemplateVariableOperations,
} from '../../../../ports/inbound/template-variables/template-variables.port.js';
import {
  AdminHttpBoundary,
  HttpFailure,
  type IAdminHttpSettings,
  readAdminBody,
  sendJson,
} from '../shared/admin-http.boundary.js';

export interface IAdminTemplateVariableFactory {
  forSession(token: string | null): ITemplateVariableOperations;
}

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})(?:\/pages\/([A-Za-z0-9_-]{1,128}))?\/template-variables$/;

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== 'string' || !value.length) {
    throw new HttpFailure(400, 'Invalid ' + key);
  }

  return value;
}

export class AdminTemplateVariablesController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminTemplateVariableFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const match = route.exec(this.boundary.check(request, response));

      if (!match) {
        throw new HttpFailure(400, 'Invalid TV route');
      }

      const siteId = match[1]!;
      const pageId = match[2];
      const operations = this.operations.forSession(this.boundary.token(request));

      if (request.method === 'GET') {
        sendJson(response, 200, pageId ? await operations.getPage.execute({ siteId, pageId })
          : await operations.list.execute({ siteId }));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request, 1024 * 1024);
      const allowed = pageId ? ['values', 'templateId', 'expectedUpdatedAt', 'catalogVersion', 'mediaVersion']
        : ['fields', 'expectedVersion'];

      if (Object.keys(body).some((key) => !allowed.includes(key))) {
        throw new HttpFailure(400, 'Unknown TV fields');
      }
      if (pageId) {
        validateTemplateValues(body.values);
        const at = text(body, 'expectedUpdatedAt');
        const expectedUpdatedAt = new Date(at);

        if (!Number.isFinite(expectedUpdatedAt.getTime()) || expectedUpdatedAt.toISOString() !== at) {
          throw new HttpFailure(400, 'Expected UTC page instant');
        }
        sendJson(response, 200, await operations.savePage.execute({
          siteId,
          pageId,
          values: body.values,
          templateId: text(body, 'templateId'),
          expectedUpdatedAt,
          catalogVersion: text(body, 'catalogVersion'),
          mediaVersion: text(body, 'mediaVersion'),
        }));
      } else {
        const fields = body.fields;

        validateTemplateVariables(fields);
        sendJson(response, 200, await operations.save.execute({
          siteId,
          fields,
          expectedVersion: text(body,
            'expectedVersion'),
        }));
      }
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
