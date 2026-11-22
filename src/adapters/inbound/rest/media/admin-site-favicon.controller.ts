import type { IncomingMessage, ServerResponse } from 'node:http';

import { MediaValidationError, MediaValidationIssue } from '../../../../domain/media/media-validation.error.js';
import type { ISiteFaviconOperations } from '../../../../ports/inbound/media/site-favicon.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import { readFileUpload } from './admin-file-upload.js';

export interface IAdminSiteFaviconFactory {
  forSession(token: string | null): ISiteFaviconOperations;
}

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/favicon(\/delete)?$/;

export class AdminSiteFaviconController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminSiteFaviconFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(this.boundary.check(request, response), this.boundary.origin);
      const match = route.exec(url.pathname);

      if (!match || url.search) {
        throw new HttpFailure(400, 'Invalid favicon request');
      }

      const operations = this.operations.forSession(this.boundary.token(request));
      const siteId = match[1]!;

      if (request.method === 'GET' && !match[2]) {
        sendJson(response, 200, { favicon: await operations.get.execute({ siteId }) });

        return;
      }
      this.boundary.method(request, response, 'POST');

      if (match[2]) {
        const body = await readAdminBody(request, 1024);

        if (Object.keys(body).length) {
          throw new HttpFailure(400, 'Unknown favicon delete fields');
        }
        await operations.delete.execute({ siteId });
        sendJson(response, 200, { favicon: null });

        return;
      }

      const uploaded = readFileUpload(request);
      const { filename } = uploaded.metadata;

      if (typeof filename !== 'string' || Object.keys(uploaded.metadata).some((key) => key !== 'filename')) {
        throw new HttpFailure(400, 'Invalid favicon metadata');
      }
      sendJson(response, 200, {
        favicon: await operations.upload.execute({ siteId, filename, content: uploaded.content }),
      });
    } catch (error) {
      if (error instanceof MediaValidationError) {
        sendJson(response, error.issue === MediaValidationIssue.ImageTooLarge ? 413 : 400, { error: error.issue });
      } else {
        this.boundary.failure(response, error);
      }
    }
  }
}
