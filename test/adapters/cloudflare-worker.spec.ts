import { createCloudflareWorker } from '../../src/adapters/inbound/gateway/cloudflare/worker.js';

it('exposes the executor receipt for the actual deployed Worker without caching a previous receipt', async () => {
  const worker = createCloudflareWorker({
    publicOrigin: 'https://example.test',
    backendOrigin: 'https://origin.test',
    mediaPath: '/assets',
    requestPaths: [],
    staticPolicies: {},
  });
  const response = await worker.fetch(new Request('https://example.test/', { method: 'HEAD' }), {
    ASSETS: { fetch: async () => new Response(null) },
    ZARYA_DEPLOYMENT_RECEIPT: 'attempt:release',
  });

  expect(response.headers.get('X-Zarya-Deployment')).toBe('attempt:release');
});

describe('Cloudflare gateway', () => {
  const routing = {
    publicOrigin: 'https://example.test',
    backendOrigin: 'https://origin.test',
    mediaPath: '/assets',
    requestPaths: ['/schedule/'],
    staticPolicies: { '/': "script-src 'self'; style-src 'self'" },
  };

  afterEach(() => vi.unstubAllGlobals());

  it('always proxies the replaceable favicon before cached assets or redirects', async () => {
    const backend = vi.fn<(request: Request) => Promise<Response>>(async () =>
      new Response(null, { status: 304, headers: { ETag: '"new"' } }));
    const assets = { fetch: vi.fn(async () => new Response('stale')) };

    vi.stubGlobal('fetch', backend);
    const worker = createCloudflareWorker({
      ...routing,
      redirects: { '/favicon.ico': { target: '/old/', status: 301 } },
    });
    const env = { ASSETS: assets, ZARYA_EDGE_PROXY_SECRET: 'secret' };
    const response = await worker.fetch(new Request('https://example.test/favicon.ico', {
      method: 'HEAD', headers: { 'If-None-Match': '"new"' },
    }), env);

    expect(response.status).toBe(304);
    expect(assets.fetch).not.toHaveBeenCalled();
    const forwarded = backend.mock.calls[0]![0];

    expect(forwarded.url).toBe('https://origin.test/favicon.ico');
    expect(forwarded.method).toBe('HEAD');
    expect(forwarded.headers.get('if-none-match')).toBe('"new"');
    expect(forwarded.headers.get('x-zarya-public-host')).toBe('example.test');
    expect((await worker.fetch(new Request('https://example.test/favicon.ico', { method: 'POST' }), env)).status).toBe(405);
    expect(backend).toHaveBeenCalledTimes(1);
  });

  it.each(['GET', 'HEAD', 'POST'])('redirects HTTP %s before assets or proxying', async (method) => {
    const backend = vi.fn();
    const assets = { fetch: vi.fn() };

    vi.stubGlobal('fetch', backend);
    const worker = createCloudflareWorker(routing);
    const response = await worker.fetch(new Request('http://example.test/games/?source=test%20value', {
      method,
    }), { ASSETS: assets });

    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('https://example.test/games/?source=test%20value');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(assets.fetch).not.toHaveBeenCalled();
    expect(backend).not.toHaveBeenCalled();
    expect((await worker.fetch(new Request('http://foreign.test/games/'), { ASSETS: assets })).status).toBe(421);
  });

  it('serves extensionless raw documents with the selected MIME and noindex header', async () => {
    const worker = createCloudflareWorker({
      ...routing,
      staticDocuments: {
        '/raw/': { documentPath: 'raw/index.txt', mimeType: 'application/vnd.test+json', noindex: true },
      },
    });
    const assets = {
      fetch: vi.fn<(request: Request) => Promise<Response>>(async () => new Response('{"literal":true}', {
        headers: { 'Content-Type': 'text/plain' },
      })),
    };
    const result = await worker.fetch(new Request('https://example.test/raw/'), { ASSETS: assets });

    expect(result.headers.get('Content-Type')).toBe('application/vnd.test+json');
    expect(result.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(assets.fetch.mock.calls[0]?.[0].url).toBe('https://example.test/raw/index.txt');
    expect(await result.text()).toBe('{"literal":true}');
  });

  it('selects the prebuilt Markdown artifact for static pages', async () => {
    const fetchAsset = async (request: Request): Promise<Response> => {
      expect(request).toBeInstanceOf(Request);

      return new Response('# Title', { headers: { ETag: '"md"' } });
    };
    const assets = { fetch: vi.fn(fetchAsset) };
    const worker = createCloudflareWorker({
      ...routing,
      staticDocuments: {
        '/': {
          documentPath: 'index.html', markdownPath: 'representations/home.md', mimeType: 'text/html', noindex: false,
        },
      },
    });
    const result = await worker.fetch(new Request('https://example.test/', {
      headers: { Accept: 'text/markdown' },
    }), { ASSETS: assets });

    expect(new URL(assets.fetch.mock.calls[0]![0].url).pathname).toBe('/representations/home.md');
    expect(result.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(result.headers.get('Vary')).toBe('Accept');
    expect(result.headers.get('ETag')).toBe('"md"');
    expect(await result.text()).toBe('# Title');
  });
  it('serves static HTML from Assets with precomputed policy and no backend call', async () => {
    const backend = vi.fn();
    const assets = { fetch: vi.fn(async () => new Response('<html>Static</html>')) };

    vi.stubGlobal('fetch', backend);
    const result = await createCloudflareWorker(routing).fetch(new Request('https://example.test/'), {
      ASSETS: assets,
    });

    expect(await result.text()).toBe('<html>Static</html>');
    expect(result.headers.get('Content-Security-Policy')).toBe(routing.staticPolicies['/']);
    expect(backend).not.toHaveBeenCalled();
  });

  it('proxies Request pages on every call with query, status and no-store, without a release selector', async () => {
    const backend = vi.fn<(request: Request) => Promise<Response>>()
      .mockImplementation(async () => new Response('Live', {
        status: 200, headers: { 'Cache-Control': 'public, max-age=500' },
      }));

    vi.stubGlobal('fetch', backend);
    const worker = createCloudflareWorker(routing);
    const env = { ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'secret' };

    for (let index = 0; index < 2; index++) {
      const response = await worker.fetch(new Request('https://example.test/schedule/?page=2'), env);

      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toBe('Live');
    }
    const forwarded = backend.mock.calls[0]?.[0];

    expect(forwarded?.url).toBe('https://origin.test/schedule/?page=2');
    expect(forwarded?.headers.get('x-zarya-public-host')).toBe('example.test');
    expect(forwarded?.headers.get('x-zarya-proxy-secret')).toBe('secret');
    expect(forwarded?.headers.has('x-zarya-release')).toBe(false);
    expect(forwarded?.cache).toBe('no-store');
    expect(backend).toHaveBeenCalledTimes(2);
  });

  it.each(['/api/admin/sites/site/files', '/api/admin/sites/site/files/image/change'])(
    'preserves streamed upload metadata and bytes through %s',
    async (pathname) => {
      const metadata = encodeURIComponent(JSON.stringify({
        expectedVersion: 'v1', filename: 'logo.png', folderId: null, mode: 'Responsive',
      }));
      let forwarded: Request | undefined;
      let byteSize = 0;
      const backend = vi.fn(async (request: Request) => {
        forwarded = request;
        const reader = request.body!.getReader();

        try {
          for (;;) {
            const chunk = await reader.read();

            if (chunk.done) {
              break;
            }
            byteSize += chunk.value.byteLength;
          }
        } finally {
          reader.releaseLock();
        }

        return new Response(null, { status: request.headers.get('X-Zarya-File-Metadata') === metadata ? 204 : 400 });
      });

      vi.stubGlobal('fetch', backend);
      const request = new Request('https://example.test' + pathname, {
        method: 'POST',
        body: new Blob(['first chunk', 'second chunk']),
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': '23',
          'X-Zarya-File-Metadata': metadata,
          'X-Zarya-Admin': '1',
          Cookie: 'zarya_admin_session=session',
          Origin: 'https://example.test',
          'X-Zarya-Actor-Id': 'spoofed',
          'X-Zarya-Proxy-Secret': 'spoofed',
        },
      });
      const response = await createCloudflareWorker(routing).fetch(request, {
        ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'secret',
      });

      expect(response.status).toBe(204);
      expect(forwarded?.headers.get('X-Zarya-File-Metadata')).toBe(metadata);
      expect(forwarded?.headers.get('Content-Length')).toBe('23');
      expect(forwarded?.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(forwarded?.headers.get('Cookie')).toBe('zarya_admin_session=session');
      expect(forwarded?.headers.get('X-Zarya-Actor-Id')).toBeNull();
      expect(forwarded?.headers.get('X-Zarya-Proxy-Secret')).toBe('secret');
      expect(byteSize).toBe(23);
    },
  );

  it('preserves POST, cookies and Origin, replaces spoofed headers and forwards redirects', async () => {
    const backend = vi.fn(async (request: Request) => {
      expect(await request.text()).toBe('{"value":1}');
      expect(request.headers.get('Cookie')).toBe('session=owned');
      expect(request.headers.get('Origin')).toBe('https://example.test');
      expect(request.headers.get('X-Zarya-Admin')).toBe('1');
      expect(request.headers.get('x-zarya-actor-id')).toBeNull();
      expect(request.headers.get('x-zarya-public-host')).toBe('example.test');
      expect(request.headers.get('x-forwarded-host')).toBeNull();
      expect(request.redirect).toBe('manual');

      return new Response(null, { status: 302, headers: { Location: '/admin/', 'Set-Cookie': 'session=new; Secure' } });
    });

    vi.stubGlobal('fetch', backend);
    const request = new Request('https://example.test/api/admin/auth/login', {
      method: 'POST',
      body: '{"value":1}',
      headers: {
        Cookie: 'session=owned',
        Origin: 'https://example.test',
        'X-Zarya-Admin': '1',
        'x-zarya-actor-id': 'forged',
        'x-forwarded-host': 'foreign.test',
        'x-zarya-public-host': 'foreign.test',
        'x-zarya-proxy-secret': 'forged',
      },
    });
    const result = await createCloudflareWorker(routing).fetch(request, {
      ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'secret',
    });

    expect(result.status).toBe(302);
    expect(result.headers.get('Set-Cookie')).toContain('session=new');
  });

  it.each(['1', 'unexpected', undefined])('preserves the supplied public request marker: %s', async (marker) => {
    const backend = vi.fn(async (request: Request) => new Response(JSON.stringify({
      marker: request.headers.get('X-Zarya-Request'),
      origin: request.headers.get('Origin'),
      fetchSite: request.headers.get('Sec-Fetch-Site'),
      idempotencyKey: request.headers.get('Idempotency-Key'),
      body: await request.json(),
    })));

    vi.stubGlobal('fetch', backend);
    const response = await createCloudflareWorker(routing).fetch(new Request('https://example.test/api/requests', {
      method: 'POST',
      headers: {
        Origin: 'https://example.test',
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
        'Idempotency-Key': 'request-identity',
        ...(marker === undefined ? {} : { 'X-Zarya-Request': marker }),
      },
      body: JSON.stringify({ places: 1 }),
    }), { ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'secret' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      marker: marker ?? null,
      origin: 'https://example.test',
      fetchSite: 'same-origin',
      idempotencyKey: 'request-identity',
      body: { places: 1 },
    });
    expect(backend).toHaveBeenCalledOnce();
  });

  it('fails closed on an unknown host or missing proxy secret and sanitizes backend failure', async () => {
    const backend = vi.fn(async () => {
      throw new Error('private connection details');
    });
    const worker = createCloudflareWorker(routing);

    vi.stubGlobal('fetch', backend);
    const env = { ASSETS: { fetch: vi.fn() } };

    expect((await worker.fetch(new Request('https://foreign.test/schedule/'), env)).status).toBe(421);
    expect((await worker.fetch(new Request('https://example.test/schedule/'), env)).status).toBe(503);
    expect(backend).not.toHaveBeenCalled();
    const result = await worker.fetch(new Request('https://example.test/schedule/'), {
      ...env, ZARYA_EDGE_PROXY_SECRET: 'secret',
    });

    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('private');
  });

  it('serves redirects locally and forwards missing public assets', async () => {
    const backend = vi.fn(async () => new Response('asset', {
      headers: { 'Cache-Control': 'public, max-age=60' },
    }));

    vi.stubGlobal('fetch', backend);
    const worker = createCloudflareWorker({
      ...routing, redirects: { '/old/': { target: '/', status: 301 } },
    });
    const env = {
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, ZARYA_EDGE_PROXY_SECRET: 'secret',
    };
    const redirect = await worker.fetch(new Request('https://example.test/old/'), env);

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Location')).toBe('/');
    expect(backend).not.toHaveBeenCalled();
    const response = await worker.fetch(new Request('https://example.test/assets/files/new.pdf'), env);

    expect(await response.text()).toBe('asset');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect((await worker.fetch(new Request('https://example.test/unknown/'), env)).status).toBe(404);
    expect(backend).toHaveBeenCalledOnce();
  });
});
