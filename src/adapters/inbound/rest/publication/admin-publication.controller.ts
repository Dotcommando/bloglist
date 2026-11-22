import type { IncomingMessage, ServerResponse } from 'node:http';

import { PageNotFoundError } from '../../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../../domain/pages/page-scope.error.js';
import { isElementKey } from '../../../../domain/rendering/rendering-element.js';
import { RoutingConflictError } from '../../../../domain/routing/routing-conflict.error.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import { requestUsesAutomaticPageUrl } from '../shared/admin-request-gate.js';
import type { IAdminPublicationOperationFactory } from './admin-publication-operations.factory.js';

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})(?:\/pages\/([A-Za-z0-9_-]{1,128}))?\/publication$/;

const siteRoute = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/publish$/;

export class AdminPublicationController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminPublicationOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname) || siteRoute.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const full = siteRoute.exec(target);
      const match = route.exec(target);

      if (!full && !match) {
        throw new HttpFailure(400, 'Invalid publication route');
      }

      const operations = this.operations.forSession(this.boundary.token(request));
      const siteId = full?.[1] ?? match![1]!;
      const pageId = match?.[2];

      if (full) {
        this.boundary.method(request, response, 'POST');
        const body = await readAdminBody(request);

        if (Object.keys(body).length) {
          throw new HttpFailure(400, 'Unknown fields');
        }
        sendJson(response, 200, await operations.publishSite.execute(siteId));
      } else if (request.method === 'GET') {
        sendJson(response, 200, await operations.getOptions.execute({ siteId, ...(pageId ? { pageId } : {}) }));
      } else {
        this.boundary.method(request, response, 'POST');

        if (!pageId) {
          throw new HttpFailure(405, 'Page identity required');
        }

        const body = await readAdminBody(request);

        if (
          Object.keys(body).some((key) => !['templateId', 'path'].includes(key))
          || Object.values(body).some((value) => typeof value !== 'string')
        ) {
          throw new HttpFailure(400, 'Invalid publication fields');
        }

        const templateId = body.templateId;
        const path = body.path;

        if (path !== undefined && requestUsesAutomaticPageUrl(request)) {
          throw new HttpFailure(403, 'Forbidden');
        }
        if (
          templateId !== undefined
          && (typeof templateId !== 'string'
          || !isElementKey(templateId))
          || path !== undefined
          && (typeof path !== 'string'
          || path.length > 2048)
        ) {
          throw new HttpFailure(400, 'Invalid publication settings');
        }

        const result = await operations.publishPage.execute({
          siteId,
          pageId,
          ...(typeof templateId === 'string' ? { templateId } : {}),
          ...(typeof path === 'string' ? { path } : {}),
        });

        sendJson(response, 200, { page: result.page.toState(), publication: result.publication });
      }
    } catch (error) {
      if (error instanceof PageScopeError || error instanceof PageNotFoundError) {
        this.boundary.failure(response, new HttpFailure(404, 'NotFound'));
      } else if (error instanceof RoutingConflictError) {
        this.boundary.failure(response, new HttpFailure(409, 'Conflict'));
      } else if (error instanceof RangeError) {
        this.boundary.failure(response, new HttpFailure(400, 'Validation'));
      } else {
        this.boundary.failure(response, error);
      }
    }
  }
}
