import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { source } from '../support/publication.js';

describe('release-qualified compiled resource URLs', () => {
  it('pins CSS references to a release without changing physical artifact paths', async () => {
    const snapshot = {
      ...source('Hello'),
      frontendSources: [{
        id: 'site',
        revision: '1',
        css: 'body{width:100px;color:navy}',
        browserTypeScript: null,
      }],
    };
    const result = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'release-old',
      snapshot,
      assetBasePath: '/assets/releases/release-old/',
      requestPlans: [],
      documents: [{
        pageId: 'page-1',
        html: '<html><head></head><body>Hello</body></html>',
        frontendSourceIds: ['site'],
      }],
    });
    const file = result.artifacts.find((file) => file.mimeType === 'text/html')!;
    let html = '';

    for await (const bytes of file.content.bytes) {
      html += new TextDecoder().decode(bytes);
    }
    expect(html).toContain('/assets/releases/release-old/styles/common.reflow.');
    expect(result.artifacts.some((file) => file.path.startsWith('assets/styles/'))).toBe(true);
  });
});
