import { prefersMarkdown } from '../http/markdown-negotiation.js';
import { parsePublicQuery, PublicQueryLimitError } from '../http/public-query.js';

export interface ICloudflareRouting {
  readonly publicOrigin: string;
  readonly backendOrigin: string;
  readonly mediaPath: string;
  readonly requestPaths: readonly string[];
  readonly staticDocuments?: Readonly<Record<string, {
    readonly documentPath: string; readonly markdownPath?: string; readonly mimeType: string; readonly noindex: boolean;
  }>>;
  readonly staticPolicies: Readonly<Record<string, string>>;
  readonly redirects?: Readonly<Record<string, { readonly target: string; readonly status: 301 | 308 }>>;
}

export interface ICloudflareEnvironment {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly ZARYA_EDGE_PROXY_SECRET?: string;
  readonly ZARYA_DEPLOYMENT_RECEIPT?: string;
}

/** Edge-only runtime: no database, compiler, filesystem or CMS administrator authority. */
export function createCloudflareWorker(routing: ICloudflareRouting): {
  fetch(request: Request, env: ICloudflareEnvironment): Promise<Response>;
} {
  const dynamic = new Set(routing.requestPaths);
  const failure = (status: number): Response => new Response(null, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  const proxy = async (request: Request, env: ICloudflareEnvironment, live: boolean): Promise<Response> => {
    if (!env.ZARYA_EDGE_PROXY_SECRET) {
      return failure(503);
    }

    const url = new URL(request.url);
    const target = new URL(routing.backendOrigin);

    target.pathname = url.pathname;
    target.search = url.search;
    const forwarded = new Request(target, request);

    for (const name of [...forwarded.headers.keys()]) {
      if (
        name.startsWith('x-forwarded-')
        || name === 'forwarded'
        || name.startsWith('x-zarya-')
        && name !== 'x-zarya-admin'
        && name !== 'x-zarya-request'
        && name !== 'x-zarya-file-metadata'
      ) {
        forwarded.headers.delete(name);
      }
    }
    forwarded.headers.delete('host');
    forwarded.headers.set('x-zarya-public-host', url.host);
    forwarded.headers.set('x-zarya-proxy-secret', env.ZARYA_EDGE_PROXY_SECRET);

    try {
      const upstream = await fetch(new Request(forwarded, live
        ? { redirect: 'manual', cache: 'no-store' } : { redirect: 'manual' }));
      const response = new Response(upstream.body, upstream);

      if (live) {
        response.headers.set('Cache-Control', 'no-store');
        response.headers.delete('CDN-Cache-Control');
        response.headers.delete('Cloudflare-CDN-Cache-Control');
        response.headers.delete('Surrogate-Control');
      }

      return response;
    } catch {
      return failure(503);
    }
  };
  const worker = {
    async fetch(request: Request, env: ICloudflareEnvironment): Promise<Response> {
      const url = new URL(request.url);
      const canonical = new URL(routing.publicOrigin);

      if (url.protocol === 'http:' && canonical.protocol === 'https:' && url.host === canonical.host) {
        url.protocol = canonical.protocol;
        url.port = canonical.port;

        return new Response(null, {
          status: 308,
          headers: { Location: url.href, 'Cache-Control': 'no-store' },
        });
      }
      if (url.origin !== routing.publicOrigin) {
        return failure(421);
      }
      if (!/^\/(?:api|admin)(?:\/|$)/.test(url.pathname)) {
        try {
          parsePublicQuery(url.search.slice(1));
        } catch (error) {
          return failure(error instanceof PublicQueryLimitError ? error.statusCode : 400);
        }
      }
      if (url.pathname === '/favicon.ico') {
        return ['GET', 'HEAD'].includes(request.method) ? proxy(request, env, false) : failure(405);
      }

      const redirect = routing.redirects?.[url.pathname];

      if (redirect) {
        return new Response(null, { status: redirect.status, headers: { Location: encodeURI(redirect.target) } });
      }
      if (/^\/(?:api|admin)(?:\/|$)/.test(url.pathname) || dynamic.has(url.pathname)) {
        return proxy(request, env, true);
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        return failure(405);
      }

      const document = routing.staticDocuments?.[url.pathname];
      const markdown = Boolean(document?.markdownPath && prefersMarkdown(request.headers.get('Accept') ?? undefined));
      const assetPath = markdown ? document!.markdownPath
        : document?.mimeType !== 'text/html' ? document?.documentPath : undefined;
      const assetRequest = assetPath ? new Request(new URL('/' + assetPath, url), request) : request;
      const asset = await env.ASSETS.fetch(assetRequest);

      if (
        asset.status === 404
        && (url.pathname.startsWith('/assets/')
        || url.pathname.startsWith(routing.mediaPath + '/images/')
        || url.pathname.startsWith(routing.mediaPath + '/files/'))
      ) {
        return proxy(request, env, false);
      }

      const policy = routing.staticPolicies[url.pathname];
      const response = new Response(asset.body, asset);

      if (policy && !markdown && response.status === 200) {
        response.headers.set('Content-Security-Policy', policy);
        response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      }
      if (document && (response.status >= 200 && response.status < 300 || response.status === 304)) {
        const mimeType = markdown ? 'text/markdown' : document.mimeType;

        response.headers.set('Content-Type', mimeType + (mimeType.startsWith('text/') ? '; charset=utf-8' : ''));

        if (document.markdownPath) {
          response.headers.set('Vary', 'Accept');
        }
        response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');

        if (document.noindex) {
          response.headers.set('X-Robots-Tag', 'noindex');
        }
      }
      response.headers.set('X-Content-Type-Options', 'nosniff');

      return response;
    },
  };

  return {
    async fetch(request, env): Promise<Response> {
      const response = await worker.fetch(request, env);

      if (env.ZARYA_DEPLOYMENT_RECEIPT) {
        response.headers.set('X-Zarya-Deployment', env.ZARYA_DEPLOYMENT_RECEIPT);
      }

      return response;
    },
  };
}
