import { bundleCloudflareWorker } from '../../src/adapters/outbound/deployment/cloudflare/worker-bundle.js';

describe('Cloudflare Worker packaging', () => {
  it('produces a self-contained Worker with HTTP negotiation', async () => {
    const source = await bundleCloudflareWorker(
      new URL('../../src/adapters/inbound/gateway/cloudflare/worker.ts', import.meta.url));
    const workerModule = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const worker = workerModule.createCloudflareWorker({
      publicOrigin: 'https://example.test',
      backendOrigin: 'https://origin.test',
      mediaPath: '/assets',
      requestPaths: [],
      staticPolicies: {},
      staticDocuments: {
        '/': {
          documentPath: 'index.html', markdownPath: 'representations/page.md', mimeType: 'text/html', noindex: false,
        },
      },
    });
    const response = await worker.fetch(new Request('https://example.test/', { headers: { Accept: 'text/markdown' } }), {
      ASSETS: { fetch: async (request: Request) => new Response(new URL(request.url).pathname) },
    });

    expect(await response.text()).toBe('/representations/page.md');
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');

    vi.stubGlobal('fetch', async (request: Request) => new Response(null, {
      status: request.headers.get('X-Zarya-Request') === '1'
        || request.headers.get('X-Zarya-File-Metadata') === 'metadata' ? 204 : 403,
    }));

    try {
      const submitted = await worker.fetch(new Request('https://example.test/api/requests', {
        method: 'POST',
        headers: { Origin: 'https://example.test', 'X-Zarya-Request': '1' },
      }), { ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'secret' });

      expect(submitted.status).toBe(204);

      for (const suffix of ['', '/image/change']) {
        const upload = await worker.fetch(new Request('https://example.test/api/admin/sites/site/files' + suffix, {
          method: 'POST',
          body: new Blob(['synthetic']),
          headers: { 'Content-Type': 'application/octet-stream', 'X-Zarya-File-Metadata': 'metadata' },
        }), { ASSETS: { fetch: vi.fn() }, ZARYA_EDGE_PROXY_SECRET: 'secret' });

        expect(upload.status).toBe(204);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
