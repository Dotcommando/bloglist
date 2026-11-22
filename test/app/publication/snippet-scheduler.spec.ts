import { SnippetSchedulerService } from '../../../src/app/services/publication/snippet-scheduler.service.js';
import { SnippetExecution } from '../../../src/domain/rendering/snippet.js';
import type { ISnippetExecutionTask } from '../../../src/ports/outbound/publication/template-composition.port.js';

function gate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

const task = (id: string, run: ISnippetExecutionTask['run'], dependsOn: readonly string[] = [],
  execution = SnippetExecution.ParallelRead): ISnippetExecutionTask => ({ id, run, dependsOn, execution });

it('overlaps independent reads, waits for diamond dependencies and preserves command barriers', async () => {
  const scheduler = new SnippetSchedulerService();
  const events: string[] = [];
  const first = gate();
  const second = gate();
  const started = gate();
  const pending = scheduler.execute([
    task('a', async () => {
      events.push('a');
      await first.promise;
    }),
    task('b', async () => {
      events.push('b');
      started.resolve();
      await second.promise;
    }),
    task('diamond', async () => {
      events.push('diamond');
    }, ['a', 'b']),
    task('command', async () => {
      events.push('command');
    }, [], SnippetExecution.Sequential),
    task('after', async () => {
      events.push('after');
    }),
  ], new AbortController().signal);

  await started.promise;
  expect(events).toEqual(['a', 'b']);
  first.resolve();
  second.resolve();
  await pending;
  expect(events).toEqual(['a', 'b', 'diamond', 'command', 'after']);
});

it('rejects cycles, missing dependencies and invalid metadata before dispatching any task', async () => {
  const scheduler = new SnippetSchedulerService();
  const run = vi.fn();

  await expect(scheduler.execute([task('a', run, ['b']), task('b', run, ['a'])],
    new AbortController().signal)).rejects.toThrow();
  await expect(scheduler.execute([task('a', run, ['missing'])],
    new AbortController().signal)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});

it('bounds reads across renders and cancels queued work after a required failure', async () => {
  const scheduler = new SnippetSchedulerService({ perRender: 2, perProcess: 2 });
  const started = gate();
  const release = gate();
  const events: string[] = [];
  const first = scheduler.execute([
    task('slow', async (signal) => {
      events.push('slow');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    }),
    task('fail', async () => {
      started.resolve();
      await release.promise;
      throw new Error('failed');
    }),
    task('never', async () => {
      events.push('never');
    }),
  ], new AbortController().signal);
  const rejected = expect(first).rejects.toThrow('failed');

  await started.promise;
  const second = scheduler.execute([task('other-render', async () => {
    events.push('other-render');
  })],
  new AbortController().signal);

  await Promise.resolve();
  expect(scheduler.snapshot()).toMatchObject({ active: 2, queued: 1 });
  release.resolve();
  await rejected;
  await second;
  expect(events).toEqual(['slow', 'other-render']);
  expect(scheduler.snapshot()).toMatchObject({ active: 0, queued: 0 });
});
