import {
  MemoryRequestDocumentCacheAdapter,
} from '../../../src/adapters/outbound/publication/memory/request-document-cache.adapter.js';
import { DocumentOutputAdapter } from '../../../src/adapters/outbound/rendering/html/document-output.adapter.js';
import { RequestDocumentCacheService } from '../../../src/app/services/publication/request-document-cache.service.js';
import { RenderPublishedPageUseCase } from '../../../src/app/use-cases/publication/render-published-page.use-case.js';
import type { IStoredRequestPlan } from '../../../src/domain/publication/published-document.js';
import { DocumentRepresentation } from '../../../src/domain/publication/published-document.js';
import type { IRenderedDocument } from '../../../src/domain/publication/render-plan.js';
import { ParameterKind } from '../../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../../src/domain/publication/request-cache.policy.js';
import type { IRenderPublishedPageInput } from '../../../src/ports/inbound/publication/render-published-page.port.js';
import { storedPlan } from './render-published-page.spec.js';

describe('Request cache at published rendering boundary', () => {
  function setup(enabled = true): {
    operation: RenderPublishedPageUseCase;
    render: ReturnType<typeof vi.fn<() => Promise<IRenderedDocument>>>;
    input: IRenderPublishedPageInput;
    replace: (next: IStoredRequestPlan) => void;
    stored: IStoredRequestPlan;
    memory: MemoryRequestDocumentCacheAdapter;
  } {
    let stored = storedPlan();

    if (enabled) {
      stored = {
        ...stored,
        plan: {
          ...stored.plan,
          rendering: {
            ...stored.plan.rendering,
            requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 5000 },
          },
        },
      };
    }

    const render = vi.fn(async (): Promise<IRenderedDocument> => ({
      html: '<html><head></head><body>ok</body></html>',
      pageId: 'page-1',
      frontendSourceIds: [],
    }));
    const memory = new MemoryRequestDocumentCacheAdapter();
    const operation = new RenderPublishedPageUseCase({ readPlan: async () => stored },
      { render }, new DocumentOutputAdapter(), {
        getActive: vi.fn(),
        activate: vi.fn(),
        findActivation: async (siteId, releaseId) => ({ siteId, releaseId, activatedAt: new Date() }),
      }, { toMarkdown: () => 'ok' }, undefined, new RequestDocumentCacheService(memory), memory);
    const input = { siteId: 'site-1', releaseId: 'release-1', renderPlanId: 'page-1', path: '/' };

    return {
      operation,
      memory,
      render,
      input,
      replace: (next: typeof stored) => {
        stored = next;
      },
      stored,
    };
  }

  it('uses the admitted plan fingerprint without hashing the stored plan on hits or misses', async () => {
    const s = setup();
    const digest = vi.spyOn(s.memory, 'digest');

    s.replace({ ...s.stored, contentFingerprint: 'verified-content-fingerprint' });
    expect((await s.operation.execute(s.input)).cacheStatus).toBe('miss');
    expect((await s.operation.execute(s.input)).cacheStatus).toBe('hit');
    expect(digest).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledWith(expect.objectContaining({ planDigest: 'verified-content-fingerprint' }));
  });

  it('validates before lookup and separates route, normalized input and representation', async () => {
    const old = setup(false);

    await old.operation.execute(old.input);
    await old.operation.execute(old.input);
    expect(old.render).toHaveBeenCalledTimes(2);
    const s = setup();

    expect((await s.operation.execute(s.input)).cacheStatus).toBe('miss');
    expect((await s.operation.execute(s.input)).cacheStatus).toBe('hit');
    const referral = await s.operation.execute({ ...s.input, requestValues: { unknown: '1' } });

    expect(referral.cacheStatus).toBe('hit');
    expect((await s.operation.execute({ ...s.input, requestValues: { utm_source: 'newsletter' } })).cacheStatus)
      .toBe('hit');
    await s.operation.execute({ ...s.input, path: '/another/' });
    await s.operation.execute({ ...s.input, representation: DocumentRepresentation.Markdown });
    expect(s.render).toHaveBeenCalledTimes(3);
    s.replace({ ...s.stored, releaseId: 'next' });
    await s.operation.execute({ ...s.input, releaseId: 'next' });
    expect(s.render).toHaveBeenCalledTimes(4);
  });

  it('keys declared inputs after typed normalization and validates them before a hit', async () => {
    const s = setup();

    s.replace({
      ...s.stored,
      plan: {
        ...s.stored.plan,
        requestParameters: [
          { name: 'page', kind: ParameterKind.Number, required: false, defaultValue: 1, nullable: true },
          { name: 'utm_source', kind: ParameterKind.String, required: false },
        ],
      },
    });
    expect((await s.operation.execute(s.input)).cacheStatus).toBe('miss');
    expect((await s.operation.execute({ ...s.input, requestValues: { page: '1' } })).cacheStatus).toBe('hit');
    expect((await s.operation.execute({ ...s.input, requestValues: { page: null } })).cacheStatus).toBe('miss');
    expect((await s.operation.execute({ ...s.input, requestValues: { utm_source: 'a' } })).cacheStatus).toBe('miss');
    expect((await s.operation.execute({ ...s.input, requestValues: { utm_source: 'b' } })).cacheStatus).toBe('miss');
    expect((await s.operation.execute({ ...s.input, requestValues: { utm_source: 'a' } })).cacheStatus).toBe('hit');
    await expect(s.operation.execute({ ...s.input, requestValues: { page: 'invalid' } })).rejects.toThrow();
    await expect(s.operation.execute({ ...s.input, requestValues: { page: ['1', '2'] } })).rejects.toThrow();
    expect(s.render).toHaveBeenCalledTimes(4);
  });

  it('bypasses for private requests or missing trusted route context and retains CSP on hits', async () => {
    const s = setup();
    const first = await s.operation.execute(s.input);
    const hit = await s.operation.execute(s.input);

    expect(hit.inlineStyleHashes).toEqual(first.inlineStyleHashes);
    await s.operation.execute({ ...s.input, sharedCacheAllowed: false });
    await s.operation.execute({ ...s.input, path: undefined });
    expect(s.render).toHaveBeenCalledTimes(3);
  });
});
