import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { source } from '../support/publication.js';

describe('named media in published HTML', () => {
  it('retains configured image URLs in HTML/CSS without reading site source files', async () => {
    const snapshot = {
      ...source('Hello'),
      frontendSources: [{
        id: 'site',
        revision: '1',
        css: '.hero{width:100px;background-image:url(/media/images/photo.webp)}',
        browserTypeScript: null,
      }],
    };
    const adapter = new FrontendBuildAdapter('/media', undefined, new MarkdownConversionAdapter());
    const input = {
      releaseId: 'release',
      snapshot,
      requestPlans: [],
      documents: [{
        pageId: 'page-1',
        html: '<html><head></head><body><picture>'
          + '<source srcset="/media/images/photo.webp 100w" type="image/webp">'
        + '<img src="/media/images/photo.webp" width="100" height="40"></picture></body></html>',
        frontendSourceIds: ['site'],
      }],
    };
    const built = await adapter.build(input);
    const html = built.artifacts.find((item) => item.mimeType === 'text/html')!;
    const chunks = [];

    for await (const chunk of html.content.bytes) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks).toString()).toContain('/media/images/photo.webp');
    await expect(adapter.build({
      ...input,
      documents: [{
        ...input.documents[0]!,
        html: input.documents[0]!.html.replaceAll('photo.webp', 'photo%2fescape.webp'),
      }],
    })).rejects.toThrow('Invalid');
  });
});
