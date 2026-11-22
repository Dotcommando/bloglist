import {
  RequestRefreshWorkerAdapter,
} from '../../src/adapters/outbound/rendering/workers/request-refresh-worker.adapter.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import type { IRequestDocumentGeneration } from '../../src/ports/outbound/publication/request-document-refresh.port.js';
import { source } from '../support/publication.js';

const runner = new URL('../fixtures/request-refresh-runner.mjs', import.meta.url);

function input(mode = 'ok'): IRequestDocumentGeneration {
  const page = source('content').pages[0]!;
  const rendering = {
    ...page.rendering!,
    delivery: HtmlDelivery.Request,
    requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 },
  };

  return {
    stored: {
      siteId: page.siteId,
      releaseId: 'r',
      assets: { head: '', body: '' },
      plan: {
        siteId: page.siteId,
        planId: page.pageId,
        pageId: page.pageId,
        page: { ...page, rendering },
        rendering,
        settings: {},
        requestParameters: [],
        buildValues: {},
        templates: [],
        loaders: [],
        frontendSourceIds: [],
        snippetCachePolicies: { Read: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 60000 } },
      },
    },
    values: { mode },
  };
}

it('reaps timed-out work, expires queued admission and rejects shutdown and startup failure', async () => {
  const adapter = new RequestRefreshWorkerAdapter(runner, { execute: vi.fn() }, [],
    { timeoutMs: 150, queueWaitMs: 50 });
  const aborted = new AbortController();

  aborted.abort();
  await expect(adapter.regenerate(input(), aborted.signal)).rejects.toThrow();
  expect(adapter.snapshot().active).toBe(0);
  const pending = Promise.allSettled([
    adapter.regenerate(input('hold'), new AbortController().signal),
    adapter.regenerate(input(), new AbortController().signal),
  ]);

  expect((await pending).every((result) => result.status === 'rejected')).toBe(true);
  await vi.waitFor(() => expect(adapter.snapshot()).toMatchObject({ active: 0, queued: 0, bytes: 0 }));
  await adapter.onModuleDestroy();
  await expect(adapter.regenerate(input(), new AbortController().signal)).rejects.toThrow();

  const missing = new RequestRefreshWorkerAdapter(new URL('../fixtures/absent-worker.mjs', import.meta.url),
    { execute: vi.fn() }, []);

  try {
    await expect(missing.regenerate(input(), new AbortController().signal)).rejects.toThrow();
    await vi.waitFor(() => expect(missing.snapshot().active).toBe(0));
  } finally {
    await missing.onModuleDestroy();
  }

  const shutdown = new RequestRefreshWorkerAdapter(runner, { execute: vi.fn() }, []);
  const closing = Promise.allSettled([shutdown.regenerate(input('hold'), new AbortController().signal)]);

  await shutdown.onModuleDestroy();
  expect((await closing)[0]).toMatchObject({ status: 'rejected' });
  expect(shutdown.snapshot()).toMatchObject({ active: 0, bytes: 0 });
});

it('uses and reuses a separate thread and bridges cache-safe reads with background admission', async () => {
  const execute = vi.fn(async (_id, _parameters, context) => {
    expect(context.siteId).toBe('site-1');
    expect(context.background).toBe(true);
    expect(context.cachePolicy.scope).toBe(RequestCacheScope.SharedPublic);

    return 'bridged';
  });
  const adapter = new RequestRefreshWorkerAdapter(runner, { execute }, []);

  try {
    const first = await adapter.regenerate(input(), new AbortController().signal);
    const second = await adapter.regenerate(input(), new AbortController().signal);

    expect(Number(first.html)).toBeGreaterThan(0);
    expect(second.html).toBe(first.html);
    expect((await adapter.regenerate(input('bridge'), new AbortController().signal)).html).toBe('bridged');
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    await adapter.onModuleDestroy();
  }
});

it('bounds queued work, cancels before dispatch and replaces a crashed thread without replay', async () => {
  const adapter = new RequestRefreshWorkerAdapter(runner, { execute: vi.fn() }, [], { queueLimit: 1 });
  const cancellation = new AbortController();
  const queuedCancellation = new AbortController();

  try {
    const first = adapter.regenerate(input('hold'), cancellation.signal);
    const queued = adapter.regenerate(input(), queuedCancellation.signal);
    const settled = Promise.allSettled([first, queued]);

    await expect(adapter.regenerate(input(), new AbortController().signal)).rejects.toThrow();
    queuedCancellation.abort();
    cancellation.abort();
    expect((await settled).every((result) => result.status === 'rejected')).toBe(true);
    await vi.waitFor(() => expect(adapter.snapshot().active).toBe(0));
    await expect(adapter.regenerate(input('crash'), new AbortController().signal)).rejects.toThrow();
    await vi.waitFor(() => expect(adapter.snapshot().active).toBe(0));
    await expect(adapter.regenerate(input('malformed'), new AbortController().signal)).rejects.toThrow();
    await vi.waitFor(() => expect(adapter.snapshot().active).toBe(0));
    expect((await adapter.regenerate(input(), new AbortController().signal)).pageId).toBe('page-1');
  } finally {
    await adapter.onModuleDestroy();
  }
});

it('observes bridge failure and keeps physical admission while aborted bridge work settles', async () => {
  let finish!: (value: string) => void;
  const execute = vi.fn(() => new Promise<string>((resolve) => {
    finish = resolve;
  }));
  const adapter = new RequestRefreshWorkerAdapter(runner, { execute }, []);
  const cancellation = new AbortController();

  try {
    const result = Promise.allSettled([adapter.regenerate(input('bridge'), cancellation.signal)]);

    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    cancellation.abort();
    expect((await result)[0]).toMatchObject({ status: 'rejected' });
    expect(adapter.snapshot().active).toBe(1);
    finish('late');
    await vi.waitFor(() => expect(adapter.snapshot().active).toBe(0));
    execute.mockRejectedValueOnce(new Error('private provider failure'));
    await expect(adapter.regenerate(input('bridge'), new AbortController().signal)).rejects.toThrow();
  } finally {
    await adapter.onModuleDestroy();
  }
});
