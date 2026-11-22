import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { fileContent } from '../../../../outbound/storage/files/binary-file.js';
import { writeFileResponse } from '../../../shared/file-response.js';
import { readAdminPublicAssets } from './admin-asset-manifest.js';
import { ADMIN_DOCUMENT_ROUTES } from './admin-document.routes.js';

export class AdminDocumentController {
  constructor(private readonly root: string, private readonly origin: string | (() => string),
    private readonly previousOrigin: () => string | null = () => null,
    private readonly publicAssets: ReadonlySet<string> = new Set(),
    private readonly authorize: (request: IncomingMessage, response: ServerResponse) =>
    Promise<boolean> = async () => false) {}

  static async create(root: string, origin: () => string, previousOrigin: () => string | null,
    authorize: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>):
  Promise<AdminDocumentController> {
    return new AdminDocumentController(root, origin, previousOrigin, await readAdminPublicAssets(root), authorize);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; "
      + "connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; "
      + "frame-ancestors 'none'; form-action 'self'");

    const origin = typeof this.origin === 'string' ? this.origin : this.origin();
    const host = request.headers.host?.toLowerCase();

    if (host !== new URL(origin).host) {
      const previous = this.previousOrigin();
      const route = request.url?.split('?')[0] ?? '';
      const safeRoute = ADMIN_DOCUMENT_ROUTES.paths.includes(route) || ADMIN_DOCUMENT_ROUTES.sitePath.test(route)
        || ADMIN_DOCUMENT_ROUTES.assetPath.test(route);

      if (
        previous
        && host === new URL(previous).host
        && ['GET', 'HEAD'].includes(request.method ?? '')
        && safeRoute
        && !/[\\\\#%]/.test(route)
        && (request.url?.length ?? 0) <= 4096
      ) {
        response.writeHead(308, { Location: new URL(request.url!, origin).href }).end();

        return;
      }
      response.writeHead(403).end();

      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405).end();

      return;
    }

    const target = request.url?.split('?')[0] ?? '';
    const shell = ADMIN_DOCUMENT_ROUTES.paths.includes(target) || ADMIN_DOCUMENT_ROUTES.sitePath.test(target);
    const asset = ADMIN_DOCUMENT_ROUTES.assetPath.exec(target);

    if (!shell && !asset) {
      response.writeHead(404).end();

      return;
    }

    try {
      if (asset && !this.publicAssets.has('assets/' + asset[1]) && !await this.authorize(request, response)) {
        if (!response.writableEnded) {
          response.writeHead(401).end();
        }

        return;
      }

      const root = await realpath(this.root);
      const file = await realpath(path.join(root, shell ? 'index.html' : 'assets/' + asset?.[1]));
      const relative = path.relative(root, file);

      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(404).end();

        return;
      }

      const info = await stat(file);

      response.setHeader('Content-Type', shell ? 'text/html; charset=utf-8'
        : asset?.[2] === 'js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
      response.setHeader('Content-Length', info.size);
      response.statusCode = 200;

      if (request.method !== 'HEAD') {
        await writeFileResponse(response, fileContent(file, info.size, 'application/octet-stream').bytes);
      }
      response.end();
    } catch {
      if (response.headersSent) {
        response.destroy();
      } else {
        response.writeHead(404).end();
      }
    }
  }
}
