import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { source } from '../support/publication.js';
import { urlFixture } from '../support/routing.js';

describe('literal document publication', () => {
  it('rejects a raw file that would also have to be a directory', async () => {
    const base = source('unused');
    const file = { ...base.pages[0]!, pageId: 'file', mimeType: 'text/plain' };
    const child = { ...base.pages[0]!, pageId: 'child' };

    await expect(new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'collision',
      snapshot: {
        ...base,
        pages: [file, child],
        urls: [
          urlFixture({ urlId: 'file-url', pageId: file.pageId, path: '/feed' }).toState(),
          urlFixture({ urlId: 'child-url', pageId: child.pageId, path: '/feed/item/' }).toState(),
        ],
      },
      documents: [
        { pageId: file.pageId, html: 'literal', frontendSourceIds: [] },
        { pageId: child.pageId, html: '<html><head></head><body>Child</body></html>', frontendSourceIds: [] },
      ],
      requestPlans: [],
    })).rejects.toThrow('directory');
  });
  it('publishes custom MIME and empty text without invoking templates or generating HTML', async () => {
    const base = source('unused');
    const text = '<?xml version="1.0"?>\n<raw>[[*title]] &amp; untouched</raw>\n';
    const state = { ...base.pages[0]! };

    delete state.rendering;
    const page = {
      ...state,
      mimeType: 'application/xml',
      contentMd: text,
      status: PageStatus.PUBLISHED,
    };
    const snapshot = { ...base, pages: [page], urls: [urlFixture({ path: '/feed.xml' }).toState()] };
    const composition = new ModxCompositionAdapter();
    const plan = await composition.prepare(snapshot, page.pageId);
    const document = await new RenderDataService(composition, {
      validate: () => undefined,
      execute: async () => {
        throw new Error('Raw documents must not execute loaders');
      },
    }).render(plan, false);
    const built = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'raw', snapshot, documents: [document], requestPlans: [],
    });
    const file = built.artifacts.find((item) => item.path === 'feed.xml')!;
    let result = '';

    for await (const chunk of file.content.bytes) {
      result += new TextDecoder().decode(chunk);
    }
    expect(file.mimeType).toBe('application/xml');
    expect(result).toBe(text);
    expect(built.manifest.routes[0]).toMatchObject({ documentPath: 'feed.xml' });
    const empty = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'empty',
      snapshot: { ...snapshot, pages: [{ ...page, mimeType: 'text/plain', contentMd: '' }] },
      documents: [{ ...document, html: '' }],
      requestPlans: [],
    });

    expect(empty.artifacts.find((item) => item.path === 'feed.xml')?.byteSize).toBe(0);
  });
});
