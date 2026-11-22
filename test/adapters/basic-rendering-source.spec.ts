import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  BasicRenderingSourceAdapter,
} from '../../src/adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import { FileRenderingSourceAdapter } from '../../src/adapters/outbound/rendering/files/rendering-source.adapter.js';
import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { OpenGraphType } from '../../src/domain/pages/open-graph-type.enum.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { pageFixture } from '../support/pages.js';

describe('explicitly registered basic document template', () => {
  it('renders escaped SEO/social metadata and fallback headings in actual HTML', async () => {
    const page = pageFixture();

    page.changeHeading('Heading');
    page.changeSeoMetadata({ metaTitle: 'Search <title>', metaDescription: 'Description "quoted"' });
    page.changeOpenGraph({
      ogTitle: 'Social',
      ogType: OpenGraphType.Article,
      ogImage: 'https://example.test/share.webp',
    });
    page.setRobotsIndex(false);
    page.configureRendering({
      templateId: 'ZaryaBasic',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: {},
      loaders: [],
    });
    const sources = await new BasicRenderingSourceAdapter().read(page.siteId);
    const composition = new ModxCompositionAdapter();
    const render = async (): Promise<string> => {
      const snapshot = { ...sources, siteId: page.siteId, pages: [page.toState()], urls: [] };
      const plan = await composition.prepare(snapshot, page.pageId);

      return (await new RenderDataService(composition, new LoaderExecutionAdapter([])).render(plan, true)).html;
    };
    const html = await render();

    expect(html).toContain('<title>Search &lt;title&gt;</title>');
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('name="description" content="Description &quot;quoted&quot;"');
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(html).toContain('property="og:title" content="Social"');
    expect(html).toContain('property="og:description" content="Description &quot;quoted&quot;"');
    expect(html).toContain('property="og:image" content="https://example.test/share.webp"');
    expect(html).toContain('property="og:type" content="article"');
    page.changeHeading(null);
    page.changeSeoMetadata({ metaTitle: null, metaDescription: null });
    page.changeOpenGraph({ ogTitle: null, ogDescription: null, ogImage: null, ogType: null });
    const fallback = await render();

    expect(fallback).toContain('<title>Home</title>');
    expect(fallback).toContain('<h1>Home</h1>');
    expect(fallback).not.toContain('property="og:image"');
    expect(fallback).not.toContain('name="description"');
  });
  it('is available without site files and keeps each site publication identity separate', async () => {
    const root = await mkdtemp(path.resolve('.tmp/basic-source-'));

    try {
      const basic = new BasicRenderingSourceAdapter();
      const sources = new FileRenderingSourceAdapter(path.join(root, 'absent'), basic);
      const first = await sources.read('site-1');
      const second = await sources.read('site-2');

      expect(first.siteKey).not.toBe(second.siteKey);
      expect(first.templates).toEqual(expect.arrayContaining([expect.objectContaining({
        id: 'ZaryaBasic',
        kind: TemplateSourceKind.Template,
      })]));
      expect(first.templates[0]?.html).toContain('lang="[[*language]]"');
      expect(first.templates[0]?.html).toContain('[[*contentMd:markdown]]');
      await expect(new FileRenderingSourceAdapter(path.join(root, 'absent')).read('site-1')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
