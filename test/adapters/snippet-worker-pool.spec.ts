import { Worker } from 'node:worker_threads';

import { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { snippetWorkerRunner } from '../../src/adapters/outbound/rendering/modx/snippet-worker-runner.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import type { ILoaderContext } from '../../src/ports/outbound/publication/data-loader.port.js';

it('delivers microtask chains, parallel replies and failures without polling timers', async () => {
  const worker = new Worker(`const schedule = globalThis.setTimeout;
    globalThis.setTimeout = (...args) => {
      if (args[1] === 5) throw new Error('Polling timer is forbidden');
      return schedule(...args);
    };
    ${snippetWorkerRunner}`, { eval: true });

  try {
    const result = new Promise<unknown>((resolve, reject) => {
      const replies: { id: number; value: string }[] = [];

      worker.on('error', reject);
      worker.on('message', (message: {
        kind: string;
        id: number;
        input?: { value?: string; fail?: boolean };
        value?: unknown;
      }) => {
        if (message.kind === 'failed') {
          reject(new Error('Snippet worker failed'));
        } else if (message.kind === 'result') {
          resolve(message.value);
        } else if (message.kind === 'bridge') {
          if (message.input?.fail) {
            worker.postMessage({
              kind: 'reply',
              jobId: 'events',
              id: message.id,
              failed: true,
              code: 'Validation',
              message: 'Rejected',
            });
          } else {
            replies.push({ id: message.id, value: message.input?.value ?? '' });

            if (replies.length === 2) {
              for (const reply of replies.toReversed()) {
                worker.postMessage({ ...reply, kind: 'reply', jobId: 'events' });
              }
            }
          }
        }
      });
    });

    worker.postMessage({
      kind: 'execute',
      jobId: 'events',
      data: JSON.stringify({ input: {}, context: {} }),
      code: code(`
        const values = await Promise.all([
          Promise.resolve().then(() => context.cms.pages.get({ value: 'first' })),
          context.cms.pages.get({ value: 'second' }),
        ]);
        try {
          await context.cms.pages.get({ fail: true });
        } catch (error) {
          return [values, error.code, typeof process, typeof require, typeof setTimeout];
        }
        throw new Error('Expected a rejected CMS operation');
      `),
    });
    const output = await result;

    if (typeof output !== 'string') {
      throw new Error('Expected serialized Worker output');
    }
    expect(JSON.parse(output)).toEqual([
      ['first', 'second'], 'Validation', 'undefined', 'undefined', 'undefined',
    ]);
  } finally {
    await worker.terminate();
  }
});

const pools: SnippetWorkerPool[] = [];

const pool = (settings = {}): SnippetWorkerPool => {
  const value = new SnippetWorkerPool(settings);

  pools.push(value);

  return value;
};

const context = (extra: Partial<ILoaderContext> = {}): ILoaderContext => ({
  siteId: 'site-1',
  pageId: 'page-1',
  language: 'en',
  phase: LoaderPhase.Request,
  preview: false,
  signal: AbortSignal.timeout(5000),
  ...extra,
});

const code = (body: string): string => `async function __snippet(input, context) { ${body} }`;

afterEach(async () => {
  await Promise.all(pools.splice(0).map((value) => value.onModuleDestroy()));
});

it('reuses a thread while replacing globals, code, input and site context for every invocation', async () => {
  const workers = pool();

  expect(await workers.execute(code('globalThis.secret = input.secret; return context.siteId;'),
    { secret: 'private' }, context())).toBe('site-1');
  expect(await workers.execute(code('return [typeof secret, context.siteId, input.value];'),
    { value: 'new' }, context({ siteId: 'site-2', pageId: 'new-page' }))).toEqual(['undefined', 'site-2', 'new']);
  expect(workers.snapshot().created).toBe(1);
});

it.each([false, true])('bounds admission and preserves a public slot (refresh=%s)', async (background) => {
  const workers = pool({ size: 2, queueLimit: 1 });
  let release!: (value: unknown) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const cms = Object.assign(Object.create(null), {
    pages: {
      get: () => {
        entered();

        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
  });
  const build = workers.execute(code('return await context.cms.pages.get({});'), {},
    context({ phase: background ? LoaderPhase.Request : LoaderPhase.Build, background, cms }));
  const buildResult = Promise.allSettled([build]);

  await started;
  const abort = new AbortController();
  const queued = workers.execute(code('return "never";'), {},
    context({ phase: background ? LoaderPhase.Request : LoaderPhase.Build, background, signal: abort.signal }));
  const rejected = Promise.allSettled([queued]);

  await expect(workers.execute(code('return "overflow";'), {},
    context({ phase: background ? LoaderPhase.Request : LoaderPhase.Build, background }))).rejects.toThrow();
  expect(await workers.execute(code('return "public";'), {}, context())).toBe('public');
  abort.abort();
  expect((await rejected)[0]).toMatchObject({ status: 'rejected' });
  release('build');
  expect((await buildResult)[0]).toMatchObject({ status: 'fulfilled', value: 'build' });
  expect(workers.snapshot().created).toBe(2);
});

it('discards an aborted worker and ignores late bridge replies without replaying commands', async () => {
  const workers = pool();
  let release!: (value: unknown) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const update = vi.fn(() => {
    entered();

    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const abort = new AbortController();
  const pending = workers.execute(code('return await context.cms.pages.update({});'), {},
    context({ signal: abort.signal, cms: Object.assign(Object.create(null), { pages: { update } }) }));
  const rejected = expect(pending).rejects.toThrow();

  await started;
  abort.abort();
  await rejected;
  release('late');
  expect(await workers.execute(code('return "next";'), {}, context({ siteId: 'site-2' }))).toBe('next');
  expect(update).toHaveBeenCalledTimes(1);
  expect(workers.snapshot().discarded).toBe(1);
});

it('terminates timed out scripts and recovers with a new worker', async () => {
  const workers = pool({ executionTimeoutMs: 100 });

  await expect(workers.execute(code('while (true) {}'), {}, context())).rejects.toThrow();
  expect(await workers.execute(code('return "recovered";'), {}, context())).toBe('recovered');
  expect(workers.snapshot().created).toBe(2);
});

it('rejects oversized output and unavailable CMS operations without leaking details', async () => {
  const workers = pool();

  await expect(workers.execute(code('return "x".repeat(2097153);'), {}, context()))
    .rejects.toThrow('Snippet execution failed');
  await expect(workers.execute(code('return context.cms.pages.get({});'), {}, context()))
    .rejects.toThrow('Snippet execution failed');
  expect(await workers.execute(code('return typeof process + ":" + typeof require + ":" + typeof fetch;'), {},
    context()))
    .toBe('undefined:undefined:undefined');
});

it('settles running and queued work and stops admission on shutdown', async () => {
  const workers = pool({ size: 2 });
  const jobs = Array.from({ length: 3 }, () => workers.execute(code('return new Promise(() => {});'), {}, context()));
  const settled = Promise.allSettled(jobs);

  await workers.onModuleDestroy();
  expect((await settled).every((value) => value.status === 'rejected')).toBe(true);
  await expect(workers.execute(code('return "closed";'), {}, context())).rejects.toThrow();
  expect(workers.snapshot()).toMatchObject({ workers: 0, queued: 0, active: 0 });
});
