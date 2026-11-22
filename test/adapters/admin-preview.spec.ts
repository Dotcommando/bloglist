import { AdminPreviewCache } from '../../src/adapters/outbound/publication/memory/admin-preview.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';

describe('authenticated preview resources', () => {
  it('keeps literal empty text and MIME in an actor-scoped raw document preview', async () => {
    const cache = new AdminPreviewCache();
    const result = await cache.present('site-1', 'owner', {
      pageId: 'llms', html: '', mimeType: 'text/plain', frontendSourceIds: [],
    }, { manifest: { routes: [], artifacts: [] }, artifacts: [artifact('llms.txt', 'text/plain', '')] });

    expect(await cache.read(result.previewId, 'owner')).toMatchObject({ html: '', mimeType: 'text/plain' });
    expect(await cache.read(result.previewId, 'foreign')).toBeNull();
  });
  it('embeds compiled styles/scripts and enforces owner and expiry without public publication', async () => {
    let now = 1000;
    const cache = new AdminPreviewCache(() => now);
    const document = { pageId: 'page-1', html: '', frontendSourceIds: [] };
    const result = await cache.present('site-1', 'owner', document, {
      manifest: { routes: [], artifacts: [] },
      artifacts: [
        artifact('index.html', 'text/html', '<html><head><link rel="stylesheet" href="/assets/main.css"></head>'
          + '<body><img src="/assets/image.svg" srcset="/assets/image.svg 320w, /assets/image.svg 640w">'
          + '<script type="module" src="/assets/main.js"></script></body></html>'),
        artifact('assets/image.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        artifact('assets/main.css', 'text/css', 'body{color:red}'),
        artifact('assets/main.js', 'application/javascript', 'document.body.dataset.ready="yes";'),
      ],
    });

    expect(result.url).toMatch(/^\/api\/admin\/rendering-previews\/[a-f0-9]{48}$/);
    expect((await cache.read(result.previewId, 'owner'))?.html).toContain('<style>body{color:red}</style>');
    expect(result.html).toContain('document.body.dataset.ready');
    expect(result.html).toMatch(/srcset="data:image\/svg\+xml;base64,[^ ]+ 320w, data:/);
    expect(await cache.read(result.previewId, 'other')).toBeNull();
    now += 600001;
    expect(await cache.read(result.previewId, 'owner')).toBeNull();
  });
});
