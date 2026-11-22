import {
  MemoryRequestDocumentCacheAdapter,
} from '../../../src/adapters/outbound/publication/memory/request-document-cache.adapter.js';
import { DocumentOutputAdapter } from '../../../src/adapters/outbound/rendering/html/document-output.adapter.js';
import { RequestDocumentCacheService } from '../../../src/app/services/publication/request-document-cache.service.js';
import { RenderPublishedPageUseCase } from '../../../src/app/use-cases/publication/render-published-page.use-case.js';
import { RequestCacheScope } from '../../../src/domain/publication/request-cache.policy.js';
import { storedPlan } from './render-published-page.spec.js';

afterEach(() => {
  vi.useRealTimers();
});

it('dispatches refresh through its port with normalized public values and checks current activation', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const original = storedPlan();
  const stored = {
    ...original,
    contentFingerprint: 'verified',
    plan: {
      ...original.plan,
      rendering: { ...original.plan.rendering, requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 } },
    },
  };
  const readPlan = vi.fn(async () => stored);
  const getActive = vi.fn(async () => ({
    siteId: stored.siteId,
    releaseId: stored.releaseId,
    activatedAt: new Date(0),
  }));
  const regenerate = vi.fn(async () => ({
    html: '<html><head></head><body>new</body></html>',
    inlineStyleHashes: [],
    pageId: stored.plan.pageId,
    releaseId: stored.releaseId,
  }));
  const store = new MemoryRequestDocumentCacheAdapter();

  vi.spyOn(store, 'now').mockImplementation(() => Date.now());
  const cache = new RequestDocumentCacheService(store);
  const render = vi.fn(async () => ({
    html: '<html><head></head><body>old</body></html>',
    frontendSourceIds: [],
    pageId: stored.plan.pageId,
  }));
  const operation = new RenderPublishedPageUseCase({ readPlan }, { render }, new DocumentOutputAdapter(), {
    getActive,
    activate: vi.fn(),
    findActivation: async () => ({
      siteId: stored.siteId,
      releaseId: stored.releaseId,
      activatedAt: new Date(0),
    }),
  }, { toMarkdown: () => 'ok' }, undefined, cache, store, { regenerate });
  const input = {
    siteId: stored.siteId,
    releaseId: stored.releaseId,
    renderPlanId: stored.plan.planId,
    path: '/',
    requestValues: { utm_source: 'untrusted-public-metadata' },
  };

  try {
    await operation.execute(input);
    await vi.advanceTimersByTimeAsync(40000);
    expect(regenerate).toHaveBeenCalledOnce();
    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({ values: {} }), expect.any(AbortSignal));
    expect(getActive).toHaveBeenCalledTimes(2);
    expect((await operation.execute(input)).html).toContain('new');
    getActive.mockResolvedValue({ siteId: stored.siteId, releaseId: 'other', activatedAt: new Date(0) });
    await vi.advanceTimersByTimeAsync(40000);
    expect(regenerate).toHaveBeenCalledOnce();
    expect(cache.refreshSnapshot().failures).toBe(1);
    expect(render).toHaveBeenCalledOnce();
  } finally {
    cache.onModuleDestroy();
  }
});
