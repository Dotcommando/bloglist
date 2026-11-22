import { decodePlan } from '../../src/adapters/outbound/publication/files/plan-decoder.js';
import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { source } from '../support/publication.js';

it('renders escaped text, trusted TV Markdown and prepared image properties', async () => {
  const snapshot = {
    ...source('[[*summary]][[*extra:markdown]]<img src="[[*photo.src]]" width="[[*photo.width]]"'
      + ' height="[[*photo.height]]" alt="[[*photo.alt]]">'),
    templateValues: {
      'page-1': {
        summary: '<unsafe>',
        extra: '**Bold** <em data-owner="yes">trusted</em>',
        photo: { src: '/assets/images/game.webp', width: 320, height: 107, alt: 'A "game"' },
      },
    },
  };
  const composition = new ModxCompositionAdapter();
  const plan = await composition.prepare(snapshot, 'page-1');
  const rendered = await new RenderDataService(composition, new LoaderExecutionAdapter([])).render(plan, true);

  expect(rendered.html).toContain('&lt;unsafe&gt;');
  expect(rendered.html).toContain('<strong>Bold</strong> <em data-owner="yes">trusted</em>');
  expect(rendered.html).toContain('src="/assets/images/game.webp" width="320" height="107" alt="A &quot;game&quot;"');
  const frozen = decodePlan(JSON.parse(JSON.stringify({
    ...plan,
    rendering: { ...plan.rendering, delivery: HtmlDelivery.Request },
    page: { ...plan.page, status: PageStatus.PUBLISHED, publishedAt: new Date('2026-10-31T00:00:00Z') },
    assets: { head: '', body: '' },
  }))).plan;
  const response = await new RenderDataService(composition, new LoaderExecutionAdapter([])).render(frozen, false);

  expect(response.html).toBe(rendered.html);
});
