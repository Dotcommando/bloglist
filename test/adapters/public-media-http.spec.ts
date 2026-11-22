import { createServer } from 'node:http';

import { PublicMediaController } from '../../src/adapters/inbound/documents/http/media/public-media.controller.js';
import type { IReadPublicMedia } from '../../src/ports/inbound/media/read-public-media.port.js';
import { binary } from '../support/media.js';

describe('named image GET/HEAD', () => {
  it.each(['/media/images/photo.png', '/favicon.ico'])('revalidates %s and releases snapshots for GET, HEAD and 304',
    async (pathname) => {
      const dispose = vi.fn(async () => {});
      const execute = vi.fn<IReadPublicMedia['execute']>(async () => ({
        content: binary('png'), etag: '"v1"', dispose,
      }));
      const controller = new PublicMediaController({ execute }, '/media');
      const server = createServer((request, response) => {
        void controller.handle(request, response);
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Missing listener');
      }

      const url = 'http://127.0.0.1:' + address.port + pathname;

      expect(controller.canHandle(pathname)).toBe(true);

      try {
        const response = await fetch(url);

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('must-revalidate');
        expect(await response.text()).toBe('png');
        expect((await fetch(url, { method: 'HEAD' })).status).toBe(200);
        expect((await fetch(url, { headers: { 'if-none-match': '"v1"' } })).status).toBe(304);
        await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(3));
        dispose.mockRejectedValueOnce(new Error('cleanup failed'));
        expect((await fetch(url, { method: 'HEAD' })).status).toBe(200);
        await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(4));
        execute.mockResolvedValue(null);
        expect((await fetch(url, { headers: { 'if-none-match': '"v1"' } })).status).toBe(404);
        expect((await fetch(url, { method: 'POST' })).status).toBe(405);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
});
