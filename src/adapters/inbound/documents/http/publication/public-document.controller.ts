import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ITemplateObject } from '../../../../../domain/pages/page-rendering.js';
import {
  DocumentRepresentation,
  PublicationConsistencyError,
  PublishedDataUnavailableError,
} from '../../../../../domain/publication/published-document.js';
import { PublishedResolutionKind } from '../../../../../domain/publication/published-resolution.js';
import { requireUrlPath } from '../../../../../domain/routing/url-path.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IGetPublishedArtifact } from '../../../../../ports/inbound/publication/get-published-artifact.port.js';
import type { IRenderPublishedPage } from '../../../../../ports/inbound/publication/render-published-page.port.js';
import type { IResolvePublishedPath } from '../../../../../ports/inbound/publication/resolve-published-path.port.js';
import type { IResolveSite } from '../../../../../ports/inbound/sites/resolve-site.port.js';
import { prefersMarkdown } from '../../../gateway/http/markdown-negotiation.js';
import { parsePublicQuery, PublicQueryLimitError } from '../../../gateway/http/public-query.js';

interface IPublicTarget {
  readonly hostname: string;
  readonly authority: string;
  readonly path: string;
  readonly query: ITemplateObject;
}

function invalidTarget(): never {
  throw new BusinessError(BusinessErrorCode.Validation, 'Invalid public request target');
}

export function parsePublicTarget(target: string, host: string): IPublicTarget {
  const separator = target.indexOf('?');
  const rawPath = separator < 0 ? target : target.slice(0, separator);
  const rawQuery = separator < 0 ? '' : target.slice(separator + 1);
  let query: Record<string, string | string[]>;

  try {
    query = parsePublicQuery(rawQuery);
  } catch (error) {
    if (error instanceof PublicQueryLimitError) {
      throw error;
    }
    invalidTarget();
  }

  if (
    !host
    || /[\s,@/\\?#]/.test(host)
    || !target.startsWith('/')
    || target.startsWith('//')
    || /[\\#]/.test(target)
    || [...target].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  ) {
    invalidTarget();
  }

  let authority: URL;

  try {
    authority = new URL(`http://${host}`);
  } catch {
    invalidTarget();
  }

  if (/%(?:2f|5c)/i.test(rawPath)) {
    invalidTarget();
  }

  let pathname: string;

  try {
    pathname = decodeURIComponent(rawPath);
    requireUrlPath(pathname);
  } catch {
    invalidTarget();
  }

  if (
    pathname.includes('\\')
    || [...pathname].some((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || pathname.split('/').some((part) => part === '.' || part === '..')
  ) {
    invalidTarget();
  }

  return { hostname: authority.hostname, authority: authority.host, path: pathname, query };
}

function stylePolicy(hashes: readonly string[]): string {
  return `script-src 'self'; style-src 'self' ${hashes.map((hash) => `'${hash}'`).join(' ')}; object-src 'none'; base-uri 'self'`;
}

import {
  PageDelivery, RenderStage, ResolutionRepresentation,
} from '../../../../../domain/diagnostics/page-resolution.js';
import type { IRenderObservationPort } from '../../../../../ports/outbound/diagnostics/render-observation.port.js';
import type { PageResolutionObserver } from './page-resolution-observer.js';
import { type IHttpResolutionContext } from './page-resolution-observer.js';

export class PublicDocumentController {
  constructor(private readonly sites: IResolveSite, private readonly routes: IResolvePublishedPath,
    private readonly render: IRenderPublishedPage, private readonly artifacts: IGetPublishedArtifact,
    private readonly diagnostics?: PageResolutionObserver, private readonly observations?: IRenderObservationPort) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (this.diagnostics) {
      return this.diagnostics.handle(request, response, (context) => this.respond(request, response, context));
    }

    return this.respond(request, response);
  }

  private stage<T>(stage: RenderStage, operation: () => Promise<T>): Promise<T> {
    return this.observations?.measure(stage, operation) ?? operation();
  }

  private async respond(request: IncomingMessage,
    response: ServerResponse,
    context?: IHttpResolutionContext): Promise<void> {
    const cancellation = new AbortController();
    const abort = (): void => {
      cancellation.abort();
    };

    request.once('aborted', abort);
    response.once('close', abort);
    response.removeHeader('X-Powered-By');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        this.finish(response, 405);

        return;
      }
      if (request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length > 1) {
        invalidTarget();
      }

      const target = parsePublicTarget(request.url ?? '', request.headers.host ?? '');
      const site = await this.stage(RenderStage.Site,
        () =>
          this.sites.execute({
            hostname: target.hostname,
            authority: target.authority,
          }));

      if (site && context) {
        context.siteId = site.siteId;
        context.path = target.path;
        context.representation =
          prefersMarkdown(request.headers.accept)
            ? ResolutionRepresentation.Markdown
            : ResolutionRepresentation.Html;
      }
      if (!site || /^\/(?:api|admin)(?:\/|$)/.test(target.path)) {
        this.finish(response, 404);

        return;
      }
      if (target.path === '/sitemap.xml') {
        if (context) {
          context.excluded = true;
        }
        await this.file(site.siteId, null, 'sitemap.xml', request, response, cancellation.signal, false, true);

        return;
      }
      if (target.path.startsWith('/assets/')) {
        if (context) {
          context.excluded = true;
        }

        const match = /^\/assets\/releases\/([A-Za-z0-9_-]+)\/(.+)$/.exec(target.path);

        if (target.path.startsWith('/assets/releases/') && !match) {
          this.finish(response, 404);

          return;
        }
        await this.file(site.siteId, match?.[1] ?? null, match ? `assets/${match[2]}` : target.path.slice(1),
          request, response, cancellation.signal, true);

        return;
      }

      const route = await this.stage(RenderStage.Route,
        () =>
          this.routes.execute({
            siteId: site.siteId,
            path: target.path,
          }));

      if (context) {
        context.delivery = route.kind === PublishedResolutionKind.StoredDocument ? PageDelivery.Static
          : route.kind === PublishedResolutionKind.RequestPlan ? PageDelivery.Dynamic
            : route.kind === PublishedResolutionKind.Redirect ? PageDelivery.Redirect : PageDelivery.Unresolved;
      }

      switch (route.kind) {
        case PublishedResolutionKind.NotFound:
          this.finish(response, 404);

          return;
        case PublishedResolutionKind.Redirect:
          response.setHeader('Location', encodeURI(route.targetPath));
          this.finish(response, route.status);

          return;
        case PublishedResolutionKind.StoredDocument:
          if (route.markdownPath) {
            response.setHeader('Vary', 'Accept');
          }
          await this.file(site.siteId, route.releaseId,
            route.markdownPath && prefersMarkdown(request.headers.accept) ? route.markdownPath : route.documentPath,
            request, response, cancellation.signal, false, route.robotsIndex === false);

          return;
        case PublishedResolutionKind.RequestPlan: {
          const markdown = prefersMarkdown(request.headers.accept);
          const result = await this.render.execute({
            siteId: site.siteId,
            releaseId: route.releaseId,
            renderPlanId: route.renderPlanId,
            requestValues: target.query,
            path: target.path,
            sharedCacheAllowed: request.headers.authorization === undefined,
            signal: cancellation.signal,
            ...(markdown ? { representation: DocumentRepresentation.Markdown } : {}),
          });

          if (route.robotsIndex === false) {
            response.setHeader('X-Robots-Tag', 'noindex');
          }
          if (markdown && result.markdown === undefined) {
            throw new PublicationConsistencyError('Markdown representation is unavailable');
          }

          const body = markdown ? result.markdown! : result.html;

          if (result.cacheStatus) {
            response.setHeader('X-Zarya-Cache', result.cacheStatus);
          }

          response.setHeader('Content-Type', markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
          response.setHeader('Vary', 'Accept');
          response.setHeader('Cache-Control', 'no-store');

          if (!markdown) {
            response.setHeader('Content-Security-Policy', stylePolicy(result.inlineStyleHashes));
          }
          response.setHeader('Content-Length', Buffer.byteLength(body));
          response.statusCode = 200;
          response.end(request.method === 'HEAD' ? undefined : body);
        }
      }
    } catch (error) {
      if (response.destroyed || cancellation.signal.aborted) {
        return;
      }
      if (response.headersSent) {
        response.destroy();

        return;
      }

      let status = 500;

      if (error instanceof PublicQueryLimitError) {
        status = error.statusCode;
      } else if (error instanceof PublishedDataUnavailableError) {
        status = 503;
      } else if (error instanceof PublicationConsistencyError) {
        status = 500;
      } else if (error instanceof BusinessError) {
        status = error.code === BusinessErrorCode.Validation ? 400 : 404;
      }
      this.finish(response, status);
    } finally {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  }

  private finish(response: ServerResponse, status: number): void {
    response.statusCode = status;
    response.setHeader('Cache-Control', 'no-store');
    response.removeHeader('Content-Length');
    response.end();
  }

  private async file(siteId: string, releaseId: string | null, path: string, request: IncomingMessage,
    response: ServerResponse, signal: AbortSignal, asset: boolean, noindex = false): Promise<void> {
    if (noindex) {
      response.setHeader('X-Robots-Tag', 'noindex');
    }

    let file = await this.stage(RenderStage.Artifact,
      () =>
        this.artifacts.execute({
          siteId,
          releaseId,
          path,
          metadataOnly: true,
        }));

    if (!file) {
      this.finish(response, 404);

      return;
    }

    const etag = `"${file.metadata.checksum}"`;

    response.setHeader('ETag', etag);
    const mimeType = file.metadata.mimeType;

    response.setHeader('Content-Type', mimeType + (mimeType.startsWith('text/') ? '; charset=utf-8' : ''));
    response.setHeader('Cache-Control', asset && (releaseId !== null || /\.[a-f0-9]{8,}\./.test(path))
      ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');

    if (request.headers['if-none-match']?.split(',').some((value) => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')) {
      response.statusCode = 304;
      response.end();

      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Length', file.content.byteSize);

    if (request.method !== 'HEAD') {
      const loaded = await this.stage(RenderStage.Artifact, () => this.artifacts.execute({ siteId, releaseId, path }));

      if (
        loaded?.metadata.checksum !== file.metadata.checksum
        || loaded.releaseId !== file.releaseId
        || loaded.metadata.byteSize !== file.metadata.byteSize
      ) {
        throw new PublicationConsistencyError('Publication changed while selecting content');
      }
      file = loaded;

      if (file.metadata.mimeType === 'text/html') {
        response.setHeader('Content-Security-Policy', stylePolicy(file.inlineStyleHashes));
      }

      for await (const chunk of file.content.bytes) {
        signal.throwIfAborted();

        if (!response.write(chunk)) {
          await once(response, 'drain', { signal });
        }
      }
    }
    response.end();
  }
}
