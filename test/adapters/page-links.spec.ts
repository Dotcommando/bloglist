import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { source } from '../support/publication.js';
import { urlFixture } from '../support/routing.js';

describe('MODX numeric page links', () => {
  it('resolves template and Markdown link destinations from a frozen same-site public catalog', async () => {
    const snapshot = source('<a href="[[~2]]">Template link</a><span>[[*id]]</span>[[*contentMd:markdown]]');
    const first = {
      ...snapshot.pages[0]!,
      pageNumber: '1',
      status: PageStatus.PUBLISHED,
      contentMd: '[Go to target]([[~2]])\n\n`[[~2]]`\n\nPlain [[~2]]',
    };
    const target = { ...first, pageId: 'target', pageNumber: '2', mark: 'Target' };
    const composition = new ModxCompositionAdapter();
    const plan = await composition.prepare({
      ...snapshot,
      pages: [first, target],
      urls: [
        urlFixture({ pageId: 'target', path: '/target/' }).toState(),
      ],
    }, first.pageId);
    const runtime = new RenderDataService(composition, new LoaderExecutionAdapter([]));
    const rendered = await runtime.render(plan, true);

    expect(rendered.html).toContain('<a href="/target/">Template link</a>');
    expect(rendered.html).toContain('<a href="/target/">Go to target</a>');
    expect(rendered.html).toContain('<span>1</span>');
    expect(rendered.html).toContain('<code>[[~2]]</code>');
    expect(rendered.html).toContain('Plain [[~2]]');
    target.title = 'New draft';
    expect((await runtime.render(plan, true)).html).toContain('href="/target/"');
    await expect(runtime.render({ ...plan, publishedPages: [] }, true)).rejects.toThrow();
  });
});
