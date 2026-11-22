import { createServer } from 'node:http';

import { CloudflareDeliveryAdapter } from
  '../../src/adapters/outbound/deployment/cloudflare/cloudflare-delivery.adapter.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

it('checks a real backend health route without requiring an administration page or sending provider credentials',
  async () => {
    const seen: { path: string; method: string; authorization: string | undefined; cookie: string | undefined }[] = [];
    let healthStatus = 200;
    const backend = createServer((request, response) => {
      seen.push({
        path: request.url ?? '',
        method: request.method ?? '',
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
      });
      request.resume();
      response.writeHead(request.url === '/api/health' ? healthStatus : 404).end();
    });

    await new Promise<void>((resolve, reject) => {
      backend.once('error', reject);
      backend.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = backend.address();

      if (!address || typeof address === 'string') {
        throw new Error('Expected owned backend TCP listener');
      }

      const target = {
        ...deploymentFixture().target,
        providerKey: 'cloudflare',
        backendOrigin: 'http://127.0.0.1:' + address.port,
      };
      const peer: typeof fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));

        if (url.origin === target.backendOrigin) {
          return fetch(input, init);
        }
        if (url.hostname === 'api.cloudflare.com' && url.pathname.endsWith('/domains')) {
          return Response.json({ success: true, result: [] });
        }
        throw new Error('Unexpected external destination');
      };
      const prepare = vi.fn(async () => ({ releaseId: 'release', directory: '/unused' }));
      const upload = vi.fn(async () => {});
      const adapter = new CloudflareDeliveryAdapter({
        accountId: 'a'.repeat(32), apiToken: 'secret',
      }, prepare, upload, peer);

      await expect(adapter.check(target)).resolves.toEqual([]);
      healthStatus = 503;
      await expect(adapter.check(target)).resolves.toEqual([{ issue: 'Backend', retryable: true }]);
      expect(seen).toEqual([
        { path: '/api/health', method: 'HEAD', authorization: undefined, cookie: undefined },
        { path: '/api/health', method: 'HEAD', authorization: undefined, cookie: undefined },
      ]);
      expect(prepare).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    } finally {
      backend.closeAllConnections();
      await new Promise<void>(resolve => backend.close(() => resolve()));
    }
  });
