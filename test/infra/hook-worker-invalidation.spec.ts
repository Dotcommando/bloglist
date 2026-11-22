import { afterEach, expect, it, vi } from 'vitest';

import { HookWorkerLifecycle } from '../../src/infra/hooks/hook-worker.lifecycle.js';

afterEach(() => vi.useRealTimers());

it('keeps idle polling from invalidating other processes and signals completed or uncertain mutations', async () => {
  vi.useFakeTimers();
  const execute = vi.fn(async () => ({ dispatched: 0, processed: 0 }));
  const invalidate = vi.fn();
  const worker = new HookWorkerLifecycle({ execute }, () => () => {}, invalidate);

  worker.onApplicationBootstrap();

  try {
    await vi.advanceTimersByTimeAsync(500);
    expect(invalidate).not.toHaveBeenCalled();
    execute.mockResolvedValueOnce({ dispatched: 1, processed: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(invalidate).toHaveBeenCalledTimes(1);
    execute.mockRejectedValueOnce(new Error('uncertain mutation'));
    await vi.advanceTimersByTimeAsync(500);
    expect(invalidate).toHaveBeenCalledTimes(2);
  } finally {
    await worker.onApplicationShutdown();
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('observes coordination cleanup failures, stops polling and reports shutdown failure', async () => {
  vi.useFakeTimers();
  const failure = new Error('Shared admission release failed');
  const execute = vi.fn(async () => ({ dispatched: 0, processed: 0 }));
  const worker = new HookWorkerLifecycle({ execute }, () => () => {
    throw failure;
  });

  worker.onApplicationBootstrap();
  await vi.advanceTimersByTimeAsync(1500);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  await expect(worker.onApplicationShutdown()).rejects.toBe(failure);
});
