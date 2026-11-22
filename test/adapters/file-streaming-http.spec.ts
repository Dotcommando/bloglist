import { createServer, request as httpRequest } from 'node:http';

import { AdminFilesController } from '../../src/adapters/inbound/rest/media/admin-files.controller.js';
import type { ILibraryUpload } from '../../src/ports/inbound/media/file-library.port.js';
import { libraryOperations } from '../support/media.js';

it('hands upload bytes to the operation before the client has sent the rest of the file', async () => {
  let received!: () => void;
  const firstChunk = new Promise<void>((resolve) => {
    received = resolve;
  });
  const view = { version: 'v2', files: [], folders: [], pending: false };
  let total = 0;
  const upload = vi.fn(async (input: ILibraryUpload) => {
    expect(input.filename).toBe('report.csv');

    for await (const chunk of input.content.bytes) {
      total += chunk.byteLength;
      received();
    }

    return view;
  });
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing listener');
  }

  const origin = 'http://127.0.0.1:' + address.port;
  const controller = new AdminFilesController({ origin }, {
    forSession: () => ({
      ...libraryOperations({ upload: { execute: upload } }),
      readableUsageTargets: async () => new Set<string>(),
    }),
  });

  server.on('request', (request, response) => {
    void controller.handle(request, response);
  });
  let client!: ReturnType<typeof httpRequest>;
  const result = new Promise<number>((resolve, reject) => {
    client = httpRequest(origin + '/api/admin/sites/site/files', {
      method: 'POST',
      headers: {
        origin,
        'x-zarya-admin': '1',
        cookie: 'zarya_admin_session=synthetic',
        'content-type': 'application/octet-stream',
        'content-length': 128 * 1024,
        'x-zarya-file-metadata': encodeURIComponent(JSON.stringify({
          expectedVersion: 'v1', filename: 'report.csv', folderId: null, mode: 'Original',
        })),
      },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    client.on('error', reject);
    client.write(Buffer.alloc(64 * 1024, 65));
  });

  try {
    const outcome = await Promise.race([
      firstChunk.then(() => 'streaming'),
      result.then((status) => 'response ' + status),
      new Promise<string>((resolve) => setTimeout(() => resolve('buffered'), 500)),
    ]);

    expect(outcome).toBe('streaming');
    client.end(Buffer.alloc(64 * 1024, 66));
    expect(await result).toBe(200);
    expect(total).toBe(128 * 1024);
    expect(upload).toHaveBeenCalledOnce();
  } finally {
    client.destroy();
    await result.catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
