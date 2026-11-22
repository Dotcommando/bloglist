import { LocalPreviewDeliveryAdapter } from '../../src/adapters/outbound/publication/local/preview-delivery.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';

describe('private loopback preview delivery', () => {
  it('serves an empty raw document with its MIME instead of requiring HTML', async () => {
    const adapter = new LocalPreviewDeliveryAdapter();

    try {
      const file = artifact('llms.txt', 'text/plain', '');
      const result = await adapter.present({
        pageId: 'llms', mimeType: 'text/plain', html: '', frontendSourceIds: [],
      }, {
        manifest: {
          routes: [{
            kind: PublishedRouteKind.Static,
            urlId: 'llms-url',
            pageId: 'llms',
            path: '/llms.txt',
            documentPath: 'llms.txt',
          }],
          artifacts: [file],
        },
        artifacts: [file],
      });
      const response = await fetch(result.url);

      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe('');
    } finally {
      await adapter.close();
    }
  });
  it('serves only this preview public artifacts and closes its listener', async () => {
    const adapter = new LocalPreviewDeliveryAdapter();

    try {
      const document = { pageId: 'p', html: '', frontendSourceIds: [] };
      const result = await adapter.present(document, {
        manifest: { routes: [], artifacts: [] },
        artifacts: [
          artifact('index.html', 'text/html', '<link href="/assets/a.css">Hello'),
          artifact('assets/a.css', 'text/css', 'body{color:red}'),
          artifact('plans/private.json', 'application/json', 'secret', false),
        ],
      });
      const response = await fetch(result.url);

      expect(response.headers.get('cache-control')).toBe('no-store');
      const html = await response.text();

      expect(html).toContain(`/${result.previewId}/assets/a.css`);
      expect((await fetch(new URL('plans/private.json', result.url))).status).toBe(404);
      expect((await fetch(new URL('/index.html', result.url))).status).toBe(404);
    } finally {
      await adapter.close();
    }
  });
});
