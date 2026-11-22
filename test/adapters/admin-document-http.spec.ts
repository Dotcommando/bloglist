import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { AdminDocumentController } from '../../src/adapters/inbound/documents/http/admin/admin-document.controller.js';

describe('administration document delivery', () => {
  let root: string;
  let server: Server;
  let base: string;
  let authenticated: boolean;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-admin-'));
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<html>Administration</html>');
    await writeFile(path.join(root, 'assets', 'index-abc.js'), 'export {};');
    await writeFile(path.join(root, 'private.txt'), 'private');
    await writeFile(path.join(root, 'assets', 'workspace-abc.js'), 'export const privateEndpoint = true;');
    await writeFile(path.join(root, 'assets', 'workspace-abc.css'), '.workspace {}');
    await mkdir(path.join(root, '.vite'));
    await writeFile(path.join(root, '.vite', 'manifest.json'), JSON.stringify({
      'index.html': {
        file: 'assets/index-abc.js', isEntry: true, dynamicImports: ['workspace'],
      },
      workspace: { file: 'assets/workspace-abc.js', css: ['assets/workspace-abc.css'] },
    }));
    authenticated = false;
    const controller = await AdminDocumentController.create(root, () => 'http://localhost', () => null,
      async () => authenticated);

    server = createServer((request, response) => {
      void controller.handle(request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing listener');
    }
    base = 'http://127.0.0.1:' + address.port;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    await rm(root, { recursive: true, force: true });
  });
  async function request(route: string, method = 'GET', host = 'localhost'): Promise<Response> {
    return new Promise((resolve, reject) => {
      const outgoing = httpRequest(base + route, { method, headers: { Host: host } }, (incoming) => {
        const chunks: Buffer[] = [];

        incoming.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        incoming.on('error', reject);
        incoming.on('end', () => {
          const headers = new Headers();

          for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) {
              headers.set(name, Array.isArray(value) ? value.join(', ') : value);
            }
          }
          resolve(new Response(Buffer.concat(chunks).toString(), { status: incoming.statusCode ?? 500, headers }));
        });
      });

      outgoing.on('error', reject);
      outgoing.end();
    });
  }
  it('serves the shell only for reserved admin routes and handles HEAD without a body', async () => {
    for (const route of ['/admin', '/admin/', '/admin/login', '/admin/sites', '/admin/sites/new',
      '/admin/sites/site-1', '/admin/sites/site-1/pages/new', '/admin/sites/site-1/pages/page-1']) {
      const response = await request(route);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toContain('Administration');
    }
    expect(await (await request('/admin/', 'HEAD')).text()).toBe('');
    expect((await request('/admin/', 'POST')).status).toBe(405);
    expect((await request('/admin/', 'GET', 'foreign.test')).status).toBe(403);
  });
  it('serves only compiled assets and rejects private files, traversal and missing assets', async () => {
    const response = await request('/admin/assets/index-abc.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('javascript');
    expect(await response.text()).toBe('export {};');

    for (const route of ['/admin/private.txt', '/admin/assets/%2e%2e%2fprivate.txt',
      '/admin/assets/index-abc.js.map', '/admin/unknown']) {
      expect((await request(route)).status).toBe(404);
    }
  });
  it('refuses private JavaScript and CSS before authentication, including HEAD', async () => {
    for (const asset of ['workspace-abc.js', 'workspace-abc.css']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await request('/admin/assets/' + asset, method);

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.text()).not.toContain('privateEndpoint');
      }
    }
  });
  it('requires a session even for unknown assets and serves private dependencies after authentication', async () => {
    expect((await request('/admin/assets/missing.js')).status).toBe(401);
    authenticated = true;
    expect((await request('/admin/assets/missing.js')).status).toBe(404);

    for (const asset of ['workspace-abc.js', 'workspace-abc.css']) {
      expect((await request('/admin/assets/' + asset)).status).toBe(200);
      const head = await request('/admin/assets/' + asset, 'HEAD');

      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
    }
    authenticated = false;
    expect((await request('/admin/assets/workspace-abc.js')).status).toBe(401);
  });
  it('serves the TV workspace deep link for GET and HEAD without accepting arbitrary descendants', async () => {
    const route = '/admin/sites/site-1/template-variables';
    const response = await request(route);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toContain('Administration');
    const head = await request(route, 'HEAD');

    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect((await request(route + '/private')).status).toBe(404);
    expect((await request(route, 'GET', 'foreign.test')).status).toBe(403);
  });
  it('serves scoped template, chunk and snippet deep links while rejecting unknown descendants', async () => {
    for (const section of ['templates', 'chunks', 'snippets']) {
      for (const suffix of ['', '/new', '/-/new', '/Header']) {
        expect((await request('/admin/sites/site-1/' + section + suffix)).status).toBe(200);
      }
      expect((await request('/admin/sites/site-1/' + section + '/Header/private')).status).toBe(404);
    }
  });
});
