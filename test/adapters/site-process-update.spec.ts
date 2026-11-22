import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type IManagedChild, SiteProcessPool }
  from '../../src/adapters/outbound/runtime/processes/site-process-pool.js';

interface ITestChild extends IManagedChild {
  readonly messages: unknown[];
  readonly signals: NodeJS.Signals[];
}

interface IUpdateFixture {
  readonly pool: SiteProcessPool;
  readonly children: ITestChild[];
  failNext(): void;
  hang(index: number): void;
}

function fixture(backpressure = false): IUpdateFixture {
  const children: ITestChild[] = [];
  const hanging = new Set<number>();
  let failed = false;
  const pool = new SiteProcessPool(() => {
    const index = children.length;
    const messages: unknown[] = [];
    const signals: NodeJS.Signals[] = [];
    const child = Object.assign(new EventEmitter(), {
      pid: 1000 + index,
      messages,
      signals,
      send(message: unknown): boolean {
        messages.push(message);

        if (
          !hanging.has(index)
          && (!message
          || typeof message !== 'object'
          || !('kind' in message)
          || message.kind !== 'prepare-update')
        ) {
          queueMicrotask(() => child.emit('exit', 0));
        }

        return !backpressure;
      },
      kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
        signals.push(signal);
        queueMicrotask(() => child.emit('exit', null, signal));

        return true;
      },
    });

    children.push(child);
    const fail = failed;

    failed = false;
    queueMicrotask(() => child.emit(fail ? 'error' : 'message',
      fail ? new Error('Candidate failed') : { kind: 'ready', port: 15000 + index, databasePoolSize: 5 }));

    return child;
  });

  return {
    pool,
    children,
    failNext: () => {
      failed = true;
    },
    hang: (index) => {
      if (index < 0) {
        hanging.clear();
      } else {
        hanging.add(index);
      }
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('Serving processes during add-on update', () => {
  it('does not terminate a process when its IPC message is queued under backpressure', async () => {
    const state = fixture(true);

    try {
      await state.pool.resize('site', 1);
      await state.pool.restart('site', 'synthetic-update');
      expect(state.children[0]?.signals).toEqual([]);
    } finally {
      await state.pool.close();
    }
  });
  it('keeps admitted requests alive before draining the retired process', async () => {
    const state = fixture();
    let release: (() => void) | undefined;

    try {
      await state.pool.resize('site', 1);
      const admitted = state.pool.acquire('site');

      release = admitted.release;
      const replacement = state.pool.restart('site', 'synthetic-update');
      const observed = Promise.allSettled([replacement]);

      await new Promise<void>(resolve => setImmediate(resolve));
      expect(state.children[0]?.messages).toContainEqual(expect.objectContaining({ kind: 'prepare-update' }));
      expect(state.children[0]?.messages).not.toContainEqual(expect.objectContaining({ kind: 'drain' }));
      expect(state.pool.select('site').child).toBe(state.children[1]);
      expect(state.pool.snapshot()).toEqual([
        expect.objectContaining({ siteId: 'site', pid: 1000, state: 'Draining' }),
        expect.objectContaining({ siteId: 'site', pid: 1001, state: 'Ready' }),
      ]);
      release();
      await observed;
      expect((await replacement).forcedProcessIds).toEqual([]);
    } finally {
      release?.();
      await state.pool.close();
    }
  });

  it.each([1, 3])('keeps a ready replacement when retiring %s allocated processes', async (count) => {
    const state = fixture();

    try {
      await state.pool.resize('site', count);
      const old = state.children.slice();
      const observed: number[] = [];

      for (const child of old) {
        child.prependOnceListener('exit', () => observed.push(state.pool.running('site')));
      }
      const result = await state.pool.restart('site', 'synthetic-update');

      expect(result.forcedProcessIds).toEqual([]);
      expect(state.pool.running('site')).toBe(count);
      expect(observed).toHaveLength(count);
      expect(observed.every((ready) => ready >= count)).toBe(true);
      expect(state.children).toHaveLength(count * 2);

      for (const child of old) {
        expect(child.messages).toContainEqual(expect.objectContaining({ kind: 'drain', addonKey: 'synthetic-update' }));
      }
    } finally {
      state.hang(-1);
      await state.pool.close();
    }
  });

  it('keeps the old process serving when its replacement fails to initialize', async () => {
    const state = fixture();

    try {
      await state.pool.resize('site', 1);
      const original = state.pool.select('site').id;

      state.failNext();
      await expect(state.pool.restart('site', 'synthetic-update')).rejects.toThrow();
      expect(state.pool.select('site').id).toBe(original);
      expect(state.children[0]?.messages).toEqual([]);
    } finally {
      state.hang(-1);
      await state.pool.close();
    }
  });

  it('forces an unresponsive old process after 20 seconds while its replacement serves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const state = fixture();

    try {
      await state.pool.resize('site', 1);
      state.hang(0);
      const result = state.pool.restart('site', 'synthetic-update');
      const observed = Promise.allSettled([result]);

      await vi.advanceTimersByTimeAsync(19999);
      expect(state.children[0]?.signals).toEqual([]);
      expect(state.pool.select('site').child).toBe(state.children[1]);
      await vi.advanceTimersByTimeAsync(1);
      expect(state.children[0]?.signals).toEqual(['SIGKILL']);
      const outcomes = await observed;

      expect(outcomes[0]?.status).toBe('fulfilled');
      expect((await result).forcedProcessIds).toHaveLength(1);
      expect(state.pool.running('site')).toBe(1);
    } finally {
      state.hang(-1);
      await state.pool.close();
    }
  });
});
