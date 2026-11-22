import type * as NodeFs from 'node:fs';
import { createReadStream } from 'node:fs';
import type * as Fs from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { AdminDocumentController } from '../../src/adapters/inbound/documents/http/admin/admin-document.controller.js';
import {
  PublicDocumentController,
} from '../../src/adapters/inbound/documents/http/publication/public-document.controller.js';
import { publicationModels } from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  FilePublishedContentAdapter,
} from '../../src/adapters/outbound/publication/files/published-content.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { GetPublishedArtifactUseCase } from '../../src/app/use-cases/publication/get-published-artifact.use-case.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { FakeReleaseActivation } from '../support/publication.js';
import { siteFixture } from '../support/sites.js';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof NodeFs>();

  return { ...fs, createReadStream: vi.fn(fs.createReadStream) };
});

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof Fs>();

  return { ...fs, readFile: vi.fn(fs.readFile) };
});

it('does not read the admin bundle for repeated HEAD requests', async () => {
  const root = await mkdtemp(path.resolve('.tmp/admin-head-'));
  const filename = path.join(root, 'assets/app.js');

  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, Buffer.alloc(2 * 1024 * 1024, 65));
  const authorize = vi.fn(async () => true);
  const controller = new AdminDocumentController(root, 'http://localhost', () => null, new Set(), authorize);
  const socket = new Socket();

  try {
    vi.mocked(readFile).mockClear();
    vi.mocked(createReadStream).mockClear();
    const request = new IncomingMessage(socket);

    request.method = 'HEAD';
    request.url = '/admin/assets/app.js';
    request.headers.host = 'localhost';
    const response = new ServerResponse(request);

    vi.spyOn(response, 'end').mockImplementation(() => response);
    await controller.handle(request, response);
    expect(response.statusCode).toBe(200);
    expect(vi.mocked(readFile).mock.calls.filter(([name]) => String(name) === filename)).toHaveLength(0);
    expect(vi.mocked(createReadStream).mock.calls.filter(([name]) => String(name) === filename)).toHaveLength(0);
  } finally {
    socket.destroy();
    await rm(root, { recursive: true, force: true });
  }
});

it('does not read large publication contents for repeated HEAD or matching conditional GET requests', async () => {
  const root = await mkdtemp(path.resolve('.tmp/public-amplification-'));
  const connection = createConnection();
  const models = publicationModels(connection);
  const site = siteFixture();
  const file = artifact('assets/large.hash.css', 'text/css', Buffer.alloc(2 * 1024 * 1024, 65));
  const metadata = {
    path: file.path,
    mimeType: file.mimeType,
    byteSize: file.byteSize,
    checksum: file.checksum,
    public: file.public,
  };
  const query = models.releases.findOne();

  vi.spyOn(query, 'exec').mockResolvedValue(new models.releases({
    _id: 'release',
    siteId: site.siteId,
    siteKey: 'demo',
    state: ReleaseState.Ready,
    createdAt: new Date(),
    completedAt: new Date(),
    manifest: { routes: [], artifacts: [metadata] },
  }));
  vi.spyOn(models.releases, 'findOne').mockReturnValue(query);
  const folder = path.join(root, 'sites/demo/release/public/assets');

  await mkdir(folder, { recursive: true });
  const filename = path.join(folder, 'large.hash.css');

  await writeFile(filename, Buffer.alloc(file.byteSize, 65));
  const reader = new FilePublishedContentAdapter(root, models.releases, { primaryDomain: async () => 'example.test' });
  const activation = new FakeReleaseActivation();

  activation.receipts.set('release', { siteId: site.siteId, releaseId: 'release', activatedAt: new Date() });
  const controller = new PublicDocumentController({ execute: async () => site },
    { execute: vi.fn() }, { execute: vi.fn() },
    new GetPublishedArtifactUseCase(reader, activation, { findRelease: async () => 'release' }));
  const socket = new Socket();

  try {
    vi.mocked(readFile).mockClear();
    vi.mocked(createReadStream).mockClear();

    for (const method of ['HEAD', 'GET', 'HEAD', 'GET']) {
      const request = new IncomingMessage(socket);

      request.url = '/assets/releases/release/large.hash.css';
      request.method = method;
      request.headers = {
        host: 'example.test',
        ...(method === 'GET' ? { 'if-none-match': '"' + file.checksum + '"' } : {}),
      };
      request.rawHeaders = ['Host', 'example.test'];
      const response = new ServerResponse(request);

      vi.spyOn(response, 'end').mockImplementation(() => response);
      await controller.handle(request, response);
      expect(response.statusCode).toBe(method === 'HEAD' ? 200 : 304);
    }
    expect(vi.mocked(readFile).mock.calls.filter(([name]) => String(name) === filename)).toHaveLength(0);
    expect(vi.mocked(createReadStream).mock.calls.filter(([name]) => String(name) === filename)).toHaveLength(0);
  } finally {
    socket.destroy();
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
});
