import { ParsedRequestPlanCache } from '../../src/adapters/outbound/publication/memory/parsed-request-plan-cache.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import type { IStoredRequestPlan } from '../../src/domain/publication/published-document.js';
import { source } from '../support/publication.js';

const stored = (siteId = 'site-1', releaseId = 'release-1', planId = 'page-1',
  contentMd = 'Frozen content'): IStoredRequestPlan => {
  const page = source('Frozen content').pages[0]!;
  const rendering = { ...page.rendering!, delivery: HtmlDelivery.Request };

  return {
    siteId,
    releaseId,
    assets: { head: '', body: '' },
    plan: {
      siteId,
      planId,
      pageId: page.pageId,
      page: { ...page, siteId, rendering, contentMd },
      rendering,
      settings: {},
      requestParameters: [],
      buildValues: {},
      templates: [],
      loaders: [],
      frontendSourceIds: [],
    },
  };
};

it('reuses a parsed plan with detached dates and separates site, release and plan identities', async () => {
  const cache = new ParsedRequestPlanCache();
  const load = vi.fn(async () => stored());
  const first = await cache.resolve('site-1', 'release-1', 'page-1', load);

  first!.plan.page.createdAt.setUTCFullYear(2000);
  const second = await cache.resolve('site-1', 'release-1', 'page-1', load);

  expect(load).toHaveBeenCalledOnce();
  expect(second!.plan.page.createdAt).toEqual(stored().plan.page.createdAt);

  for (const identity of [['site-2', 'release-1', 'page-1'], ['site-1', 'release-2', 'page-1'],
    ['site-1', 'release-1', 'page-2']]) {
    const expected = stored(identity[0]!, identity[1]!, identity[2]!);
    const scopedLoad = vi.fn(async () => expected);

    expect(await cache.resolve(identity[0]!, identity[1]!, identity[2]!, scopedLoad)).toEqual(expected);
    expect(await cache.resolve(identity[0]!, identity[1]!, identity[2]!, scopedLoad)).toEqual(expected);
    expect(scopedLoad).toHaveBeenCalledOnce();
  }
  expect(load).toHaveBeenCalledOnce();
});

it('shares concurrent reads, does not retain missing or failed plans and bounds retained memory', async () => {
  const cache = new ParsedRequestPlanCache({ maxEntries: 1, maxBytes: 65536 });
  let complete!: (value: IStoredRequestPlan) => void;
  const load = vi.fn(() => new Promise<IStoredRequestPlan>((resolve) => {
    complete = resolve;
  }));
  const first = cache.resolve('site-1', 'release-1', 'page-1', load);
  const second = cache.resolve('site-1', 'release-1', 'page-1', load);

  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  complete(stored());
  expect((await Promise.all([first, second]))[0]).toEqual(stored());
  const missing = vi.fn(async () => null);

  await cache.resolve('site-1', 'missing', 'page-1', missing);
  await cache.resolve('site-1', 'missing', 'page-1', missing);
  expect(missing).toHaveBeenCalledTimes(2);
  const failure = vi.fn(async (): Promise<never> => {
    throw new Error('Corrupt plan');
  });

  await expect(cache.resolve('site-1', 'invalid', 'page-1', failure)).rejects.toThrow('Corrupt plan');
  await expect(cache.resolve('site-1', 'invalid', 'page-1', failure)).rejects.toThrow('Corrupt plan');
  expect(failure).toHaveBeenCalledTimes(2);
  await cache.resolve('site-1', 'release-2', 'page-1', async () => stored('site-1', 'release-2'));
  const reload = vi.fn(async () => stored());

  await cache.resolve('site-1', 'release-1', 'page-1', reload);
  expect(reload).toHaveBeenCalledOnce();
  const oversized = stored('site-1', 'large', 'page-1', 'x'.repeat(65536));
  const large = vi.fn(async () => oversized);

  await cache.resolve('site-1', 'large', 'page-1', large);
  await cache.resolve('site-1', 'large', 'page-1', large);
  expect(large).toHaveBeenCalledTimes(2);
  expect(cache.snapshot().bytes).toBeLessThanOrEqual(65536);
  expect(cache.snapshot().entries).toBe(1);
});

it('fences late pre-restore reads and clears retained plans on shutdown', async () => {
  const cache = new ParsedRequestPlanCache();
  let complete!: (value: IStoredRequestPlan) => void;
  const old = cache.resolve('site-1', 'release-1', 'page-1', () => new Promise((resolve) => {
    complete = resolve;
  }));

  await Promise.resolve();
  cache.purge();
  const replacement = stored('site-1', 'release-1', 'page-1',
    'Restored content under the same release identity');

  await cache.resolve('site-1', 'release-1', 'page-1', async () => replacement);
  complete(stored());
  await old;
  const unexpected = vi.fn(async () => stored());

  expect((await cache.resolve('site-1', 'release-1', 'page-1', unexpected))?.plan.page.contentMd)
    .toBe(replacement.plan.page.contentMd);
  expect(unexpected).not.toHaveBeenCalled();
  cache.onModuleDestroy();
  expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0, pending: 0 });
  await expect(cache.resolve('site-1', 'release-1', 'page-1', unexpected)).rejects.toThrow();
});
