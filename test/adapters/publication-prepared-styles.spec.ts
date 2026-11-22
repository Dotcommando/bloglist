import { decodePlan } from '../../src/adapters/outbound/publication/files/plan-decoder.js';
import { DocumentOutputAdapter } from '../../src/adapters/outbound/rendering/html/document-output.adapter.js';
import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { source } from '../support/publication.js';
import { urlFixture } from '../support/routing.js';

it('publishes verified inline styles with Request assets and preserves exact minified output', async () => {
  const original = source('published');
  const snapshot = {
    ...original,
    urls: [urlFixture().toState()],
    pages: original.pages.map((page) => ({
      ...page,
      status: PageStatus.PUBLISHED,
      publishedAt: new Date(0),
      rendering: { ...page.rendering!, delivery: HtmlDelivery.Request },
    })),
    frontendSources: [
      { id: 'unique', revision: '1', css: '.box{width:100px;color:red}', browserTypeScript: null },
    ],
  };
  const prepared = await new ModxCompositionAdapter([]).prepare(snapshot, 'page-1');
  const plan = { ...prepared, frontendSourceIds: ['unique'] };
  const built = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
    releaseId: 'r', snapshot, documents: [], requestPlans: [plan],
  });
  const file = built.artifacts.find((item) => item.path === 'plans/page-1.json')!;
  let json = '';

  for await (const bytes of file.content.bytes) {
    json += new TextDecoder().decode(bytes);
  }
  const saved = decodePlan(JSON.parse(json));

  expect(saved.assets.inlineStyles?.length).toBeGreaterThan(0);
  const output = new DocumentOutputAdapter();
  const html = '<html><head><style>p{color:blue}</style></head>'
    + '<body><pre> x\n y </pre><textarea> a  b </textarea></body></html>';
  const current = await output.complete(html, saved.assets);
  const legacy = await output.complete(html, { head: saved.assets.head, body: saved.assets.body });

  expect(current).toEqual(legacy);
  expect(current.inlineStyleHashes).toEqual(output.inlineStyleHashes(current.html));
  const malformed = JSON.parse(json);

  malformed.assets.inlineStyles[0].hash = 'forged';
  expect(() => decodePlan(malformed)).toThrow();
});
