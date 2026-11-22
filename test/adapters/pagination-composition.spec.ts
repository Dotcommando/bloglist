import {
  BasicRenderingSourceAdapter,
} from '../../src/adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import {
  ModxCompositionAdapter,
} from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { registeredSnippets } from '../../src/infra/rendering/snippets.js';
import { pageFixture } from '../support/pages.js';
import { urlFixture } from '../support/routing.js';

describe('bundled Snippet composition', () => {
  it('renders 35 published children through the stock template/chunks and freezes the catalog', async () => {
    const sources = await new BasicRenderingSourceAdapter().read('site-1');
    const parent = pageFixture().toState();
    const root = {
      ...parent,
      pageId: 'parent',
      status: PageStatus.PUBLISHED,
      rendering: {
        templateId: 'ZaryaPagination',
        parameters: {},
        loaders: [],
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
      },
    };
    const pages = [root, ...Array.from({ length: 35 }, (_, i) => ({
      ...parent,
      pageId: 'child-' + i,
      title: 'Child ' + String(i + 1).padStart(2, '0'),
      status: PageStatus.PUBLISHED,
    }))];
    const urls = [urlFixture({ urlId: 'root', pageId: 'parent', path: '/examples/' }).toState(),
      ...pages.slice(1).map((page, i) => urlFixture({
        urlId: 'url-' + i,
        pageId: page.pageId,
        parentUrlId: 'root',
        path: '/examples/' + String(i + 1).padStart(2, '0') + '/',
      }).toState())];
    const composition = new ModxCompositionAdapter(registeredSnippets());
    const runtime = new RenderDataService(composition, new LoaderExecutionAdapter(registeredSnippets()));
    const plan = await composition.prepare({ ...sources, siteId: 'site-1', pages, urls }, root.pageId);
    const build = await runtime.render(plan, false, {}, LoaderPhase.Build);
    const first = await runtime.render({ ...plan, buildValues: build.buildValues ?? {} }, false);
    const fourth = await runtime.render(plan, false, { page: '4' });

    expect(first.html).toContain('Child 01');
    expect(first.html).not.toContain('Child 11');
    expect(fourth.html).toContain('Child 31');
    expect(fourth.html).not.toContain('Child 30');
    expect(fourth.html).toContain('href="?page=4" aria-current="page"');
    expect(fourth.html).toContain('35');
    pages[1]!.title = 'Unsaved change';
    expect((await runtime.render(plan, false)).html).toContain('Child 01');
    expect(plan.publishedPages).toHaveLength(36);
  });
});
