import type { IncomingMessage, ServerResponse } from 'node:http';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IReadPublicMedia } from '../../../../../ports/inbound/media/read-public-media.port.js';
import { writeFileResponse } from '../../../shared/file-response.js';
import { parsePublicTarget } from '../publication/public-document.controller.js';

export class PublicMediaController {
  constructor(private readonly media: IReadPublicMedia, private readonly publicPath: string) {}

  canHandle(pathname: string): boolean {
    return pathname === '/favicon.ico' || pathname.startsWith(this.publicPath + '/images/')
      || pathname.startsWith(this.publicPath + '/files/');
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.setHeader('Allow', 'GET, HEAD');
        response.writeHead(405).end();

        return;
      }
      if (request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length !== 1) {
        response.writeHead(400).end();

        return;
      }

      const target = parsePublicTarget(request.url ?? '', request.headers.host ?? '');
      const file = await this.media.execute({
        hostname: target.hostname, authority: target.authority, path: target.path,
      });

      if (!file) {
        response.writeHead(404).end();

        return;
      }

      try {
        response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        response.setHeader('ETag', file.etag);
        response.setHeader('Content-Type', file.content.mimeType);
        response.setHeader('Content-Length', file.content.byteSize);
        response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

        if (request.headers['if-none-match'] === file.etag) {
          response.writeHead(304).end();
        } else if (request.method === 'HEAD') {
          response.writeHead(200).end();
        } else {
          response.statusCode = 200;

          await writeFileResponse(response, file.content.bytes);
          response.end();
        }
      } finally {
        await file.dispose?.();
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
      } else {
        response.setHeader('Cache-Control', 'no-store');
        const status = error instanceof BusinessError && error.code === BusinessErrorCode.Validation ? 400 : 503;

        response.writeHead(status).end();
      }
    }
  }
}
