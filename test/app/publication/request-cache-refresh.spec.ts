import {
  MemoryRequestDocumentCacheAdapter,
} from '../../../src/adapters/outbound/publication/memory/request-document-cache.adapter.js';
import { RequestDocumentCacheService } from '../../../src/app/services/publication/request-document-cache.service.js';

const document = { releaseId: 'r', pageId: 'p', html: 'old', inlineStyleHashes: [] };

function setup(): { store: MemoryRequestDocumentCacheAdapter; cache: RequestDocumentCacheService } {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = new MemoryRequestDocumentCacheAdapter();

  vi.spyOn(store, 'now').mockImplementation(() => Date.now());
  const cache = new RequestDocumentCacheService(store);

  return { store, cache };
}

it('discards a late running result after purge even when the producer ignores cancellation', async () => {
  const { cache, store } = setup();
  let complete!: (value: typeof document) => void;
  let signal: AbortSignal | undefined;
  const refresh = (cancellation: AbortSignal): Promise<typeof document> => {
    signal = cancellation;

    return new Promise((resolve) => {
      complete = resolve;
    });
  };

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    await vi.advanceTimersByTimeAsync(40000);
    store.purge();
    expect(signal?.aborted).toBe(true);
    complete({ ...document, html: 'late' });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get('k')).toBeNull();
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, active: 0, failures: 1 });
    expect(cache.snapshot().fills).toBe(0);
  } finally {
    cache.onModuleDestroy();
  }
});

it('observes a producer rejection when the visitor is cancelled before attaching to its fill', async () => {
  const { cache, store } = setup();
  const cancellation = new AbortController();

  vi.spyOn(store, 'generation').mockImplementationOnce(() => {
    cancellation.abort(new Error('visitor cancelled'));

    return 0;
  });

  try {
    await expect(cache.resolve('cancelled', 's', 60000, async () => {
      throw new Error('producer rejected');
    }, cancellation.signal)).rejects.toThrow('visitor cancelled');
    await vi.advanceTimersByTimeAsync(0);
    expect(cache.snapshot()).toEqual({ fills: 0, waiters: 0 });
  } finally {
    cache.onModuleDestroy();
  }
});

it('does not regenerate an evicted entry', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = new MemoryRequestDocumentCacheAdapter({ maxEntries: 1 });
  const cache = new RequestDocumentCacheService(store);
  const refresh = vi.fn(async () => document);

  try {
    await cache.resolve('evicted', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    await cache.resolve('retained', 's', 60000, async () => document);
    await vi.advanceTimersByTimeAsync(40000);
    expect(refresh).not.toHaveBeenCalled();
    expect(cache.refreshSnapshot().scheduled).toBe(0);
  } finally {
    cache.onModuleDestroy();
  }
});

it('keeps a new timer tracked when an obsolete queued callback runs after invalidation', async () => {
  const { cache, store } = setup();
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const refresh = vi.fn(async () => document);

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    const callback = timers.mock.calls.at(-1)![0];

    if (typeof callback !== 'function') {
      throw new Error('Missing refresh callback');
    }

    store.purge('s');
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    callback();
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 1, bytes: 100 });
    await vi.advanceTimersByTimeAsync(40000);
    expect(refresh).toHaveBeenCalledOnce();
    store.purge('s');
    cache.onModuleDestroy();
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, bytes: 0, active: 0 });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    cache.onModuleDestroy();
    timers.mockRestore();
  }
});

it('observes a late rejected producer after purge and releases all refresh bookkeeping', async () => {
  const { cache, store } = setup();
  let reject!: (reason: Error) => void;

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, {
      bytes: 100,
      generate: () => new Promise((_, failure) => {
        reject = failure;
      }),
    });
    await vi.advanceTimersByTimeAsync(40000);
    store.purge('s');
    await vi.advanceTimersByTimeAsync(0);
    reject(new Error('late producer rejection'));
    await vi.advanceTimersByTimeAsync(0);
    expect(cache.snapshot()).toEqual({ fills: 0, waiters: 0 });
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, bytes: 0, active: 0, failures: 1 });
    expect(store.get('k')).toBeNull();
    cache.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    cache.onModuleDestroy();
  }
});

it('cleans up a refresh cancelled before producer admission', async () => {
  const { cache } = setup();
  const refresh = vi.fn(async () => document);

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(AbortSignal.abort(new Error('deadline already elapsed')));
    await vi.advanceTimersByTimeAsync(40000);
    expect(refresh).not.toHaveBeenCalled();
    expect(cache.snapshot()).toEqual({ fills: 0, waiters: 0 });
    expect(cache.refreshSnapshot()).toMatchObject({ scheduled: 0, bytes: 0, active: 0, failures: 1 });
  } finally {
    cache.onModuleDestroy();
    vi.restoreAllMocks();
  }
});

afterEach(() => {
  vi.useRealTimers();
});

it('refreshes a retained representation exactly 20 seconds before expiry and reschedules successful work', async () => {
  const { cache } = setup();
  const refresh = vi.fn(async () => ({ ...document, html: 'new' }));

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    await vi.advanceTimersByTimeAsync(39999);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();
    expect((await cache.resolve('k', 's', 60000, async () => document)).html).toBe('new');
    await vi.advanceTimersByTimeAsync(40000);
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally {
    cache.onModuleDestroy();
  }
});

it('does not refresh short-lived, oversized, evicted or invalidated entries', async () => {
  const { cache, store } = setup();
  const refresh = vi.fn(async () => document);

  try {
    await cache.resolve('short', 's', 20000, async () => document, undefined, { generate: refresh, bytes: 100 });
    await cache.resolve('large', 's', 60000, async () => ({ ...document, html: 'x'.repeat(3000000) }),
      undefined, { generate: refresh, bytes: 100 });
    await cache.resolve('purged', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    store.purge();
    await vi.advanceTimersByTimeAsync(60000);
    expect(refresh).not.toHaveBeenCalled();
  } finally {
    cache.onModuleDestroy();
  }
});

it('observes refresh failures without extending the old deadline or serving expired content', async () => {
  const { cache } = setup();
  const refresh = vi.fn(async (): Promise<typeof document> => {
    throw new Error('failed');
  });

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    await vi.advanceTimersByTimeAsync(40000);
    expect((await cache.resolve('k', 's', 60000, async () => document)).html).toBe('old');
    await vi.advanceTimersByTimeAsync(20001);
    const blocking = vi.fn(async () => ({ ...document, html: 'blocking' }));

    expect((await cache.resolve('k', 's', 60000, blocking)).html).toBe('blocking');
    expect(blocking).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(cache.refreshSnapshot().failures).toBe(1);
  } finally {
    cache.onModuleDestroy();
  }
});

it('coalesces expired visitors with refresh and fences late completion after maintenance', async () => {
  const { cache, store } = setup();
  let complete!: (value: typeof document) => void;
  const refresh = vi.fn(() => new Promise<typeof document>((resolve) => {
    complete = resolve;
  }));

  try {
    await cache.resolve('k', 's', 60000, async () => document, undefined, { generate: refresh, bytes: 100 });
    await vi.advanceTimersByTimeAsync(40000);
    vi.spyOn(store, 'now').mockReturnValue(60001);
    const foreground = vi.fn(async () => document);
    const visitor = Promise.allSettled([cache.resolve('k', 's', 60000, foreground)]);

    complete({ ...document, html: 'new' });
    expect((await visitor)[0]).toMatchObject({ status: 'fulfilled', value: { html: 'new' } });
    expect(foreground).not.toHaveBeenCalled();
    store.purge();
    await vi.advanceTimersByTimeAsync(60000);
    expect(store.get('k')).toBeNull();
  } finally {
    cache.onModuleDestroy();
  }
});
