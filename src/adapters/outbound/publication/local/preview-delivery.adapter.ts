import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import type { IRenderedDocument } from '../../../../domain/publication/render-plan.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IPreviewResult } from '../../../../ports/inbound/publication/preview-page.port.js';
import type { IBuiltPublication } from '../../../../ports/outbound/publication/frontend-build.port.js';
import type { IPreviewDeliveryPort } from '../../../../ports/outbound/publication/preview-delivery.port.js';
import { checksum } from '../../rendering/vite/artifacts.js';

export class LocalPreviewDeliveryAdapter implements IPreviewDeliveryPort {
  private server: Server | null = null;
  private readonly files = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  private readonly pages = new Map<string, string>();
  private starting: Promise<void> | null = null;

  private async listen(): Promise<void> {
    if (this.starting) {
      return this.starting;
    }

    const server = createServer((request, response) => {
      const address = server.address();

      if (!address || typeof address === 'string' || request.headers.host !== `127.0.0.1:${address.port}`) {
        response.writeHead(403).end();

        return;
      }

      const file = this.files.get(request.url ?? '');

      if (request.method !== 'GET' || !file) {
        response.writeHead(404).end();

        return;
      }
      response.writeHead(200, {
        'Content-Type': file.mimeType + (file.mimeType.startsWith('text/') ? '; charset=utf-8' : ''),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
      });
      response.end(file.bytes);
    });

    this.server = server;
    this.starting = new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const starting = this.starting;

    try {
      await starting;
    } catch (error) {
      // A failed listen has no active socket; a later preview must get a fresh attempt.
      if (this.server === server) {
        this.server = null;
      }
      if (this.starting === starting) {
        this.starting = null;
      }
      throw error;
    }
  }

  async present(document: IRenderedDocument, build: IBuiltPublication): Promise<IPreviewResult> {
    const previewId = randomBytes(24).toString('hex');
    const pending = new Map<string, { bytes: Uint8Array; mimeType: string }>();
    let html = '';
    const raw = (document.mimeType ?? 'text/html') !== 'text/html';
    const documentRoute = build.manifest.routes.find((route) => route.kind === PublishedRouteKind.Static
      && route.pageId === document.pageId);
    const documentPath = documentRoute?.kind === PublishedRouteKind.Static ? documentRoute.documentPath : null;

    for (const artifact of build.artifacts) {
      if (!artifact.public) {
        continue;
      }

      const parts: Uint8Array[] = [];

      for await (const part of artifact.content.bytes) {
        parts.push(part);
      }
      let bytes: Uint8Array = Buffer.concat(parts);

      requireCondition(bytes.byteLength === artifact.byteSize && checksum(bytes) === artifact.checksum,
        'Corrupt preview artifact');

      if (!raw && (artifact.mimeType === 'text/html' || artifact.mimeType === 'text/css')) {
        let text = new TextDecoder().decode(bytes);

        text = text.replaceAll('/assets/', `/${previewId}/assets/`);

        if (artifact.mimeType === 'text/html') {
          html = text;
        }
        bytes = new TextEncoder().encode(text);
      }
      pending.set(`/${previewId}/${artifact.path}`, { bytes, mimeType: artifact.mimeType });
    }
    requireCondition(raw ? documentPath !== null && pending.has('/' + previewId + '/' + documentPath)
      : Boolean(html), 'Preview build needs a document');

    if (raw) {
      html = document.html;
    }
    await this.listen();
    const old = this.pages.get(document.pageId);

    if (old) {
      for (const key of this.files.keys()) {
        if (key.startsWith(`/${old}/`)) {
          this.files.delete(key);
        }
      }
    }

    for (const [key, file] of pending) {
      this.files.set(key, file);
    }
    this.pages.set(document.pageId, previewId);
    const address = this.server!.address();

    requireCondition(address !== null && typeof address !== 'string', 'Missing preview listener');

    if (!address || typeof address === 'string') {
      throw new Error('Missing preview listener');
    }

    const entry = raw ? '/' + previewId + '/' + documentPath
      : [...pending.keys()].find((key) => pending.get(key)?.mimeType === 'text/html')!;

    return { ...document, html, previewId, url: `http://127.0.0.1:${address.port}${entry}` };
  }

  async close(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => this.server!.close((error) => error ? reject(error) : resolve()));
    }
    this.server = null;
    this.starting = null;
    this.files.clear();
    this.pages.clear();
  }
}
