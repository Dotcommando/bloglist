import type * as WorkerThreads from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';

import { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import type { ILoaderContext } from '../../src/ports/outbound/publication/data-loader.port.js';

const { threads } = vi.hoisted<{ threads: Worker[] }>(() => ({ threads: [] }));

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkerThreads>();

  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(...args: ConstructorParameters<typeof actual.Worker>) {
        super(...args);
        threads.push(this);
      }
    },
  };
});

const context = (): ILoaderContext => ({
  siteId: 'site',
  pageId: 'page',
  language: 'en',
  phase: LoaderPhase.Request,
  preview: false,
  signal: AbortSignal.timeout(5000),
});

let pool: SnippetWorkerPool;

beforeEach(() => {
  pool = new SnippetWorkerPool();
});

afterEach(async () => {
  vi.useRealTimers();
  await pool.onModuleDestroy();
  threads.splice(0);
});

it('replaces a crashed idle worker and rejects a crashed running job exactly once', async () => {
  expect(await pool.execute('async function __snippet() {return "ready";}', {}, context())).toBe('ready');
  const idle = threads[0]!;

  await idle.terminate();
  expect(await pool.execute('async function __snippet() {return "new";}', {}, context())).toBe('new');
  const running = threads.at(-1)!;
  const job = pool.execute('async function __snippet() {return new Promise(()=>{});}', {}, context());
  const rejected = expect(job).rejects.toThrow('Snippet execution failed');

  await running.terminate();
  await rejected;
  expect(await pool.execute('async function __snippet() {return "recovered";}', {}, context())).toBe('recovered');
  expect(pool.snapshot().created).toBe(3);
});

it('discards a worker after a protocol violation instead of delivering a foreign result', async () => {
  expect(await pool.execute('async function __snippet() {return "ready";}', {}, context())).toBe('ready');
  const job = pool.execute('async function __snippet() {return new Promise(()=>{});}', {}, context());
  const rejected = expect(job).rejects.toThrow();

  threads[0]!.emit('message', { kind: 'result', jobId: 'foreign', value: '"private"' });
  await rejected;
  expect(await pool.execute('async function __snippet() {return "safe";}', {}, context())).toBe('safe');
  expect(pool.snapshot().created).toBe(2);
});

it('expires queued jobs without executing them and keeps execution deadline inclusive of queue time', async () => {
  await pool.onModuleDestroy();
  pool = new SnippetWorkerPool({ size: 2, queueWaitMs: 100 });
  let ready!: () => void;
  let count = 0;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const cms = Object.assign(Object.create(null), {
    pages: {
      get: () => {
        if (++count === 2) {
          ready();
        }

        return new Promise(() => {});
      },
    },
  });
  const jobs = Array.from({ length: 2 }, () => pool.execute(
    'async function __snippet(input, context) {return context.cms.pages.get({});}', {}, { ...context(), cms }));
  const settled = Promise.allSettled(jobs);

  await started;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const queued = pool.execute('async function __snippet() {return "never";}', {}, context());
  const rejected = expect(queued).rejects.toThrow();

  await vi.advanceTimersByTimeAsync(101);
  await rejected;
  expect(pool.snapshot()).toMatchObject({ queued: 0, active: 2, rejected: 1 });
  vi.useRealTimers();
  await pool.onModuleDestroy();
  await settled;
});
