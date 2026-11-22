import { RequestDocumentCacheService } from '../../../src/app/services/publication/request-document-cache.service.js';
import type { IPublishedDocument } from '../../../src/domain/publication/published-document.js';
import type {
  IRequestDocumentCacheEntry, IRequestDocumentCachePort,
} from '../../../src/ports/outbound/publication/request-document-cache.port.js';

function setup(): {
  cache: RequestDocumentCacheService;
  store: IRequestDocumentCachePort;
  entries: Map<string, IRequestDocumentCacheEntry>;
  document: IPublishedDocument;
  advance: (value: number) => void;
} {
  let now = 0;
  let generation = 0;
  const entries = new Map<string, IRequestDocumentCacheEntry>();
  const store: IRequestDocumentCachePort = {
    now: () => now,
    digest: (value) => JSON.stringify(value),
    generation: () => generation,
    get: (key) => entries.get(key) ?? null,
    put: (key, entry) => {
      entries.set(key, entry);
    },
    purge: () => {
      entries.clear();
      generation++;
    },
  };
  const cache = new RequestDocumentCacheService(store, { maxFills: 2, maxWaiters: 4, fillTimeoutMs: 1000 });
  const document = { html: 'ok', inlineStyleHashes: ['hash'], pageId: 'p', releaseId: 'r' };

  return {
    cache,
    store,
    entries,
    document,
    advance: (value: number) => {
      now += value;
    },
  };
}

describe('shared Request document freshness', () => {
  it('expires from completion, never stores failures, and retains coherent metadata', async () => {
    const s = setup();
    const generate = vi.fn(async () => {
      s.advance(50);

      return s.document;
    });
    const first = await s.cache.resolve('key', 'site', 100, generate);

    expect(first.cacheStatus).toBe('miss');
    s.advance(99);
    expect(await s.cache.resolve('key', 'site', 100, generate)).toMatchObject({ ...s.document, cacheStatus: 'hit' });
    expect(generate).toHaveBeenCalledTimes(1);
    s.advance(1);
    expect((await s.cache.resolve('key', 'site', 100, generate)).cacheStatus).toBe('miss');
    await expect(s.cache.resolve('bad', 'site', 100, async () => {
      throw new Error('failed');
    })).rejects.toThrow('failed');
    expect(s.entries.has('bad')).toBe(false);
  });

  it('coalesces misses while one disconnected waiter cannot cancel another', async () => {
    const s = setup();
    let finish!: () => void;
    let fillSignal!: AbortSignal;
    const generate = vi.fn(async (signal: AbortSignal) => {
      fillSignal = signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });

      return s.document;
    });
    const abort = new AbortController();
    const first = s.cache.resolve('key', 'site', 100, generate, abort.signal);
    const disconnected = expect(first).rejects.toThrow();
    const second = s.cache.resolve('key', 'site', 100, generate);

    await Promise.resolve();
    abort.abort();
    await disconnected;
    expect(fillSignal.aborted).toBe(false);
    finish();
    expect((await second).cacheStatus).toBe('coalesced');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('cancels abandoned fills, bounds admission, and prevents late writes after purge', async () => {
    const s = setup();
    const abort = new AbortController();
    let release!: () => void;
    const generate = async (): Promise<IPublishedDocument> => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return s.document;
    };
    const abandoned = s.cache.resolve('old', 'site', 100, generate, abort.signal);
    const rejected = expect(abandoned).rejects.toThrow();

    await Promise.resolve();
    abort.abort();
    await rejected;
    s.store.purge('site');
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.entries.size).toBe(0);
    expect(s.cache.snapshot().fills).toBe(0);
  });

  it('keeps physical fill admission reserved until an uncooperative timed-out render settles', async () => {
    const s = setup();
    const cache = new RequestDocumentCacheService(s.store, { maxFills: 1, maxWaiters: 2, fillTimeoutMs: 5 });
    let release!: (document: IPublishedDocument) => void;
    const held = new Promise<IPublishedDocument>((resolve) => {
      release = resolve;
    });

    await expect(cache.resolve('held', 'site', 100, async () => held)).rejects.toThrow('unavailable');
    expect(cache.snapshot().fills).toBe(1);
    await expect(cache.resolve('next', 'site', 100, async () => s.document)).rejects.toThrow();
    release(s.document);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.snapshot().fills).toBe(0);
    expect(s.entries.size).toBe(0);
    expect((await cache.resolve('next', 'site', 100, async () => s.document)).cacheStatus).toBe('miss');
  });

  it('settles a disconnected fallback waiter without orphaning a rejected render', async () => {
    const s = setup();
    const disconnected = new AbortController();
    const nativeAny = AbortSignal.any.bind(AbortSignal);
    const any = vi.spyOn(AbortSignal, 'any').mockImplementation((signals) => {
      if (signals.includes(disconnected.signal)) {
        disconnected.abort(new Error('Disconnected before fallback admission'));
      }

      return nativeAny(signals);
    });
    const generate = vi.fn(async () => ({ ...s.document, cacheable: false }));

    try {
      const owner = s.cache.resolve('key', 'site', 100, generate);
      const waiter = s.cache.resolve('key', 'site', 100, generate, disconnected.signal);
      const results = await Promise.allSettled([owner, waiter]);

      expect(results[0]).toMatchObject({ status: 'fulfilled', value: { cacheStatus: 'bypass' } });
      expect(results[1]).toMatchObject({ status: 'rejected' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(generate).toHaveBeenCalledOnce();
      expect(s.cache.snapshot()).toEqual({ fills: 0, waiters: 0 });
      expect(s.entries.size).toBe(0);
    } finally {
      any.mockRestore();
      s.cache.onModuleDestroy();
    }
  });

  it('does not store or share optional fallback documents', async () => {
    const s = setup();
    const generate = vi.fn(async () => ({ ...s.document, cacheable: false }));

    await Promise.all([s.cache.resolve('key', 'site', 100, generate), s.cache.resolve('key', 'site', 100, generate)]);
    expect(s.entries.size).toBe(0);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
