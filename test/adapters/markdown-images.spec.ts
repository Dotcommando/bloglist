import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { source } from '../support/publication.js';

describe('image HTML in page content', () => {
  it('retains img/picture geometry and responsive sources while stripping executable HTML and URLs', async () => {
    const input = source('[[*contentMd:markdown]]');
    const snapshot = {
      ...input,
      pages: input.pages.map((page) => ({
        ...page,
        contentMd:
      '<picture><source type="image/webp" srcset="/media/a.webp 222w, /media/b.webp 1000w" sizes="50vw">'
      + '<img src="/media/b.webp" width="1000" height="400" alt="Photo" onerror="alert(1)"></picture>'
      + '<script>alert(1)</script><img src="javascript:alert(1)" width="1" height="1">',
      })),
    };
    const composition = new ModxCompositionAdapter();
    const plan = await composition.prepare(snapshot, 'page-1');
    const rendered = await new RenderDataService(composition, new LoaderExecutionAdapter([])).render(plan, true);

    expect(rendered.html).toContain('<picture>');
    expect(rendered.html).toContain('srcset="/media/a.webp 222w, /media/b.webp 1000w"');
    expect(rendered.html).toContain('width="1000" height="400"');
    expect(rendered.html).not.toMatch(/onerror|<script|javascript:/);
  });
});
