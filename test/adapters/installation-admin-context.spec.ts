import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { InstallationAdminContext } from '../../src/adapters/inbound/rest/installation/installation-admin-context.js';
import { AdminHttpBoundary } from '../../src/adapters/inbound/rest/shared/admin-http.boundary.js';
import { adminAddressProof } from '../../src/adapters/shared/admin-address-proof.js';
import type { IInstallationSettings } from '../../src/domain/installation/installation-settings.js';

describe('request-scoped installation origin', () => {
  let server: Server;
  let root: string;
  let base: string;
  let state: IInstallationSettings;
  let unavailable: boolean;
  const key = 'b'.repeat(64);

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-installation-'));
    await writeFile(path.join(root, 'index.html'), '<html>Administration</html>');
    state = { adminOrigin: 'https://old.example.com', previousOrigin: null, version: 'v1' };
    unavailable = false;
    const context = new InstallationAdminContext(async () => {
      if (unavailable) {
        throw new Error('Offline');
      }

      return state;
    }, async () => key, 'https://old.example.com', root);
    const boundary = new AdminHttpBoundary({ origin: 'https://old.example.com', currentOrigin: context.origin });

    server = createServer((request, response) => {
      void context.run(request, response, async () => {
        try {
          boundary.check(request, response);
          response.writeHead(200).end();
        } catch (error) {
          boundary.failure(response, error);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('No listener');
    }
    base = 'http://127.0.0.1:' + address.port;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  async function send(host: string, route = '/api/admin/test', method = 'GET', origin?: string): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const outgoing = request(base + route, {
        method,
        headers: {
          Host: host,
          ...(origin ? { Origin: origin, 'X-Zarya-Admin': '1' } : {}),
        },
      }, (incoming) => {
        incoming.resume();
        incoming.once('end', () => {
          const headers = new Headers();

          for (const [name, value] of Object.entries(incoming.headers)) {
            if (typeof value === 'string') {
              headers.set(name, value);
            }
          }
          resolve(new Response(null, { status: incoming.statusCode ?? 500, headers }));
        });
      });

      outgoing.on('error', reject);
      outgoing.end();
    });
  }
  it('switches all new requests immediately and rejects former/foreign API hosts', async () => {
    expect((await send('old.example.com')).status).toBe(200);
    state = { adminOrigin: 'https://new.example.com', previousOrigin: state.adminOrigin, version: 'v2' };
    expect((await send('old.example.com')).status).toBe(403);
    expect((await send('new.example.com')).status).toBe(200);
    expect((await send('new.example.com', '/api/admin/test', 'POST', 'https://old.example.com')).status).toBe(403);
    expect((await send('new.example.com', '/api/admin/test', 'POST', 'https://new.example.com')).status).toBe(200);
  });
  it('proves only shell HEAD delivery at a candidate host, without admitting its APIs', async () => {
    const nonce = 'c'.repeat(64);
    const response = await send('new.example.com', '/admin/?zarya-admin-probe=' + nonce, 'HEAD');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-zarya-admin-proof')).toBe(adminAddressProof(key, 'new.example.com', nonce));
    expect(response.headers.get('content-type')).toContain('text/html');
    expect((await send('new.example.com')).status).toBe(403);
    expect((await send('new.example.com', '/admin/?zarya-admin-probe=' + nonce)).status).toBe(403);
  });
  it('fails closed when settings cannot be read', async () => {
    unavailable = true;
    expect((await send('old.example.com')).status).toBe(503);
  });
});
