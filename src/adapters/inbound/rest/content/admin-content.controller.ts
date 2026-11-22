import type { IncomingMessage, ServerResponse } from 'node:http';

import { PageConflictError } from '../../../../domain/pages/page-conflict.error.js';
import { PageNotFoundError } from '../../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../../domain/pages/page-scope.error.js';
import { AutomaticPageUrlError, AutomaticPageUrlIssue } from '../../../../domain/routing/automatic-page-url.error.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import { requestContentAccess, requestPageUpdateReadAccess } from '../shared/admin-request-gate.js';
import { parsePageCreation, parsePageMove, parsePageUpdate, parseSiteCreation } from './admin-content.parser.js';
import type { IAdminContentOperationFactory } from './admin-content-operations.factory.js';

const CONTENT_ROUTE = /^\/api\/admin\/sites(?:\/([A-Za-z0-9_-]{1,128})(?:\/(pages)(?:\/([A-Za-z0-9_-]{1,128})(?:\/(position))?)?)?)?$/;

export class AdminContentController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminContentOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return CONTENT_ROUTE.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const match = CONTENT_ROUTE.exec(target);

      if (!match) {
        throw new HttpFailure(400, 'Invalid route or unexpected query');
      }

      const siteId = match[1];
      const pages = match[2];
      const pageId = match[3];
      const allowed = pageId ? ['GET', 'POST'] : siteId && !pages ? ['GET'] : ['GET', 'POST'];

      if (!allowed.includes(request.method ?? '')) {
        response.setHeader('Allow', allowed.join(', '));
        throw new HttpFailure(405, 'Method not allowed');
      }

      const operations = this.operations.forSession(this.boundary.token(request));
      const authority = requestContentAccess(request);
      const access = authority ? { authority } : {};

      if (match[4] && siteId && pageId) {
        this.boundary.method(request, response, 'POST');
        const result = await operations.movePage.execute(parsePageMove(await readAdminBody(request), siteId, pageId));

        sendJson(response, 200, result.toState());

        return;
      }
      if (!siteId) {
        if (request.method === 'GET') {
          sendJson(response, 200, { items: (await operations.listSites.execute()).map((site) => site.toState()) });
        } else {
          const result = await operations.createSite.execute(parseSiteCreation(await readAdminBody(request)));

          sendJson(response, 201, result.toState());
        }

        return;
      }
      if (!pages) {
        const result = await operations.getSite.execute({ siteId });

        if (!result) {
          throw new HttpFailure(404, 'NotFound');
        }
        sendJson(response, 200, result.toState());

        return;
      }
      if (request.method === 'GET' && !pageId) {
        const result = await operations.listPages.execute({ siteId, ...access });

        sendJson(response, 200, {
          items: result.map((page) => ({
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            mimeType: page.mimeType,
            systemDocument: page.systemDocument,
            parentPageId: page.parentPageId,
            sortOrder: page.sortOrder,
            siteId: page.siteId,
            mark: page.mark,
            language: page.language,
            title: page.title,
            status: page.status,
          })),
        });

        return;
      }
      if (request.method === 'GET' && pageId) {
        const result = await operations.getPage.execute({ siteId, pageId, ...access });

        if (!result) {
          throw new HttpFailure(404, 'NotFound');
        }
        sendJson(response, 200, result.toState());

        return;
      }

      const body = await readAdminBody(request, 1024 * 1024);

      if (pageId) {
        const saved = (await operations.updatePage.execute({ ...parsePageUpdate(body, siteId, pageId), ...access }))
          .toState();
        const read = requestPageUpdateReadAccess(request);
        let readable = false;

        if (read?.siteId === siteId) {
          try {
            readable = read.scopes.includes('all')
              || (await operations.getPage.execute({ siteId, pageId, authority: read })) !== null;
          } catch {
            // A failed read check cannot undo the save or authorize disclosing it.
          }
        }
        sendJson(response, 200, readable ? saved : { saved: true });

        return;
      }

      const created = await operations.createPage.execute({ ...parsePageCreation(body, siteId), ...access });

      sendJson(response, 201, created.toState());
    } catch (error) {
      if (error instanceof AutomaticPageUrlError) {
        this.boundary.failure(response, new HttpFailure(error.issue === AutomaticPageUrlIssue.Heading ? 400 : 409,
          error.issue));
      } else if (error instanceof PageScopeError) {
        this.boundary.failure(response, new HttpFailure(404, 'NotFound'));
      } else if (error instanceof PageNotFoundError) {
        this.boundary.failure(response, new HttpFailure(404, 'NotFound'));
      } else if (error instanceof PageConflictError) {
        this.boundary.failure(response, new HttpFailure(409, 'Conflict'));
      } else if (error instanceof RangeError) {
        this.boundary.failure(response, new HttpFailure(400, 'Validation'));
      } else {
        this.boundary.failure(response, error);
      }
    }
  }
}
