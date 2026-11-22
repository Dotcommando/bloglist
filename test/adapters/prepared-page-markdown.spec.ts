import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { source } from '../support/publication.js';

it('prepares sanitized immutable page Markdown and preserves legacy runtime output', async () => {
  const original = source('[[*contentMd:markdown]]');
  const snapshot = {
    ...original,
    pages: original.pages.map((page) => ({
      ...page,
      contentMd: '# Published\n\n<script>alert(1)</script>\n\nHello **world**',
      rendering: { ...page.rendering!, delivery: HtmlDelivery.Request },
    })),
  };
  const composition = new ModxCompositionAdapter();
  const plan = await composition.prepare(snapshot, 'page-1');

  expect(plan.preparedMarkdown?.html).toContain('<strong>world</strong>');
  expect(plan.preparedMarkdown?.html).not.toContain('<script>');
  const execution = { phase: LoaderPhase.Request, request: {}, read: vi.fn() };
  const result = await composition.compose(plan, {}, execution);
  const { preparedMarkdown, ...legacyPlan } = plan;

  expect(preparedMarkdown).toBeDefined();
  const legacy = await composition.compose(legacyPlan, {}, execution);

  expect(result).toEqual(legacy);
  const changed = await composition.compose({ ...plan, page: { ...plan.page, contentMd: 'Changed' } }, {}, execution);

  expect(changed.html).toContain('<p>Changed</p>');
  expect(changed.html).not.toContain('<strong>world</strong>');
});

it('does not precompute request markup or route-dependent Markdown and respects TV overrides', async () => {
  const original = source('[[*contentMd:markdown]]');
  const snapshot = { ...original, templateValues: { 'page-1': { contentMd: '<b>Trusted TV</b>' } } };
  const composition = new ModxCompositionAdapter();
  const plan = await composition.prepare(snapshot, 'page-1');

  expect(plan.preparedMarkdown).toMatchObject({ source: '<b>Trusted TV</b>', trusted: true });
  const linked = await composition.prepare({
    ...original,
    pages: original.pages.map((page) => ({ ...page, contentMd: '[target]([[~123]])' })),
  }, 'page-1');

  expect(linked.preparedMarkdown).toBeUndefined();
  const unused = await composition.prepare(source('Plain template'), 'page-1');

  expect(unused.preparedMarkdown).toBeUndefined();
});
