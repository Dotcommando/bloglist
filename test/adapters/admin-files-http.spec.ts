import { createServer } from 'node:http';

import { AdminFilesController } from '../../src/adapters/inbound/rest/media/admin-files.controller.js';
import { MediaValidationError, MediaValidationIssue } from '../../src/domain/media/media-validation.error.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import { binary } from '../support/media.js';

describe('administration Files HTTP', () => {
  it('passes force directly without a review token and rejects unknown fields and cross-origin requests', async () => {
    const view = { version: 'v1', files: [], folders: [], pending: false };
    const remove = vi.fn(async () => view);
    const upload = vi.fn(async () => view);
    const operations: IFileLibraryOperations = {
      list: { execute: async () => view },
      browse: { execute: vi.fn(), file: vi.fn() },
      createFolder: { execute: async () => view },
      upload: { execute: upload },
      changeImage: { execute: async () => view },
      move: { execute: async () => view },
      delete: { execute: remove },
      usages: { execute: async () => ({ version: 'v1', usages: [] }) },
      reconcile: { execute: async () => view },
      readContent: { execute: async () => ({ filename: 'image.png', content: binary('image') }) },
    };
    const factory = {
      forSession: vi.fn(() => ({ ...operations, readableUsageTargets: async () => new Set<string>() })),
    };
    const server = createServer();

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing address');
    }

    const url = 'http://127.0.0.1:' + address.port + '/api/admin/sites/site-1/files/image/delete';
    const origin = 'http://127.0.0.1:' + address.port;
    const controller = new AdminFilesController({ origin }, factory);

    server.on('request', (request, response) => {
      void controller.handle(request, response);
    });
    const headers = {
      origin,
      'x-zarya-admin': '1',
      'content-type': 'application/json',
      cookie: 'zarya_admin_session=session',
    };

    try {
      const deleted = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify({ force: true }),
      });

      expect(deleted.status).toBe(200);
      expect(remove).toHaveBeenCalledWith({ siteId: 'site-1', fileId: 'image', force: true });
      expect(factory.forSession).toHaveBeenCalledWith('session');
      const invalid = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify({ force: true, extra: 'bad', expectedVersion: 'v1' }),
      });

      expect(invalid.status).toBe(400);
      expect((await fetch(url, { method: 'POST', headers: { ...headers, origin: 'https://other.test' }, body: '{}' })).status).toBe(403);
      expect(remove).toHaveBeenCalledTimes(1);

      for (const issue of Object.values(MediaValidationIssue)) {
        upload.mockRejectedValueOnce(new MediaValidationError(issue, 'PRIVATE implementation detail'));
        const response = await fetch(origin + '/api/admin/sites/site-1/files', {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/octet-stream',
            'x-zarya-file-metadata': encodeURIComponent(JSON.stringify({
              expectedVersion: 'v1', filename: 'report.csv', folderId: null, mode: 'Original',
            })),
          },
          body: 'x',
        });

        expect(response.status).toBe(issue === MediaValidationIssue.ImageTooLarge
          || issue === MediaValidationIssue.DocumentTooLarge ? 413 : 400);
        expect(await response.json()).toEqual({ error: issue });
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
