import type { IncomingMessage, ServerResponse } from 'node:http';

import type { IAdminRenderingOperationFactory } from '../../../rest/rendering/admin-rendering-operations.factory.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings } from '../../../rest/shared/admin-http.boundary.js';

const route = /^\/api\/admin\/rendering-previews\/([a-f0-9]{48})$/;

export class AdminPreviewController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminRenderingOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const match = route.exec(this.boundary.check(request, response));

      if (!match) {
        throw new HttpFailure(400, 'Invalid preview route');
      }
      this.boundary.method(request, response, 'GET');
      const operations = this.operations.forSession(this.boundary.token(request));
      const document = await operations.readPreview.execute(match[1]!);
      const mimeType = document.mimeType ?? 'text/html';

      response.setHeader('Content-Type', mimeType + (mimeType.startsWith('text/') ? '; charset=utf-8' : ''));
      response.setHeader('X-Robots-Tag', 'noindex, nofollow');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; "
        + "script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: https: http:; "
        + "font-src data:; media-src data: https: http:; connect-src 'none'; base-uri 'none'; "
        + "form-action 'none'; frame-ancestors 'self'");
      response.statusCode = 200;
      response.end(document.html);
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
