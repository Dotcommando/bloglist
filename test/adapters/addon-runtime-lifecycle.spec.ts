import { AddonShutdownReason } from '@zarya/addon-contracts/addons';

import { AddonRuntimeLifecycle }
  from '../../src/adapters/outbound/runtime/addons/addon-runtime-lifecycle.js';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

describe('Add-on runtime shutdown', () => {
  it('stops admission immediately, signals shutdown and waits for admitted work', async () => {
    const job = deferred<void>();
    const hook = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const lifecycle = new AddonRuntimeLifecycle(hook, close);
    const active = lifecycle.run(() => job.promise);
    const stopping = lifecycle.shutdown({ reason: AddonShutdownReason.Update, deadlineAt: Date.now() + 20000 });
    const all = Promise.allSettled([active, stopping]);

    await expect(lifecycle.run(async () => 'new work')).rejects.toMatchObject({ code: 'AddonUnavailable' });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ reason: AddonShutdownReason.Update }));
    expect(close).not.toHaveBeenCalled();
    job.resolve();
    expect((await all).every((result) => result.status === 'fulfilled')).toBe(true);
    await lifecycle.close();
    await lifecycle.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('observes rejected running work and still closes resources after a shutdown-hook failure', async () => {
    const job = deferred<void>();
    const close = vi.fn(async () => undefined);
    const lifecycle = new AddonRuntimeLifecycle(async () => {
      throw new Error('shutdown failed');
    }, close);
    const active = lifecycle.run(() => job.promise);
    const stopping = lifecycle.shutdown({ reason: AddonShutdownReason.Update, deadlineAt: Date.now() + 20000 });
    const all = Promise.allSettled([active, stopping]);

    job.reject(new Error('work failed'));
    const results = await all;

    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('rejected');
    expect(close).toHaveBeenCalledOnce();
    await expect(lifecycle.close()).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it('aborts the cooperative signal at the deadline without pretending to terminate JavaScript', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let signal: AbortSignal | undefined;
    const gate = deferred<void>();
    const lifecycle = new AddonRuntimeLifecycle(async (context) => {
      signal = context.signal;
      await gate.promise;
    });
    const stopping = lifecycle.shutdown({ reason: AddonShutdownReason.Update, deadlineAt: Date.now() + 20000 });
    const observed = Promise.allSettled([stopping]);

    try {
      await vi.advanceTimersByTimeAsync(19999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
    } finally {
      gate.resolve();
      await observed;
      vi.useRealTimers();
    }
  });
});
