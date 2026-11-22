import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { SiteProcessPool } from '../../src/adapters/outbound/runtime/processes/site-process-pool.js';

interface ITestChild extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  exited: boolean;
}

function fixture(): { pool: SiteProcessPool; children: ITestChild[] } {
  const children: ITestChild[] = [];
  const pool = new SiteProcessPool((_site, _id, databasePoolSize) => {
    const child = Object.assign(new EventEmitter(), {
      exited: false,
      send: vi.fn(() => {
        queueMicrotask(() => {
          child.exited = true;
          child.emit('exit', 0);
        });

        return true;
      }),
      kill: vi.fn(() => {
        queueMicrotask(() => {
          child.exited = true;
          child.emit('exit', 1);
        });

        return true;
      }),
    });

    children.push(child);
    queueMicrotask(() => child.emit('message', { kind: 'ready', port: 10000 + children.length, databasePoolSize }));

    return child;
  }, 100);

  return { pool, children };
}

it('restores desired capacity when the successor dies while its predecessor is draining', async () => {
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 2);
    const old = children[0]!;

    old.send.mockImplementationOnce(() => true);
    const changing = pool.configureDatabasePoolSize(3);
    const observed = changing.then(() => null, (error: unknown) => error);

    await vi.waitFor(() => expect(old.send).toHaveBeenCalled());
    children[2]!.exited = true;
    children[2]!.emit('exit', 1);
    old.exited = true;
    old.emit('exit', 0);
    expect(await observed).toBeNull();
    expect(pool.running('a')).toBe(2);
    expect(pool.hasDatabasePoolSize(3)).toBe(true);
  } finally {
    await pool.close();
  }
});

it('settles a rolling replacement interrupted by shutdown without accepting late readiness', async () => {
  const { pool, children } = fixture();

  await pool.resize('a', 2);
  const changing = pool.configureDatabasePoolSize(3);
  const observed = changing.then(() => null, (error: unknown) => error);

  await pool.close();
  await observed;
  children.at(-1)!.emit('message', { kind: 'ready', port: 10001, databasePoolSize: 3 });
  expect(pool.running('a')).toBe(0);
  expect(children.every((child) => child.exited)).toBe(true);
});

it('forces a worker that exceeds its drain deadline and settles the caller', async () => {
  vi.useFakeTimers();
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 2);
    children[1]!.send.mockImplementationOnce(() => true);
    const observed = expect(pool.resize('a', 1)).rejects.toThrow('deadline');

    await vi.advanceTimersByTimeAsync(100);
    await observed;
    expect(children[1]!.kill).toHaveBeenCalledWith('SIGKILL');
    expect(pool.running('a')).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await pool.close();
    vi.useRealTimers();
  }
});

it('does not retain retired worker listeners through 60 allocation and database-pool cycles', async () => {
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 1);
    await pool.resize('b', 1);

    for (let i = 0; i < 60; i++) {
      await pool.resize('a', 3);
      await pool.configureDatabasePoolSize(i % 2 ? 2 : 3);
      await pool.resize('a', 1);
      expect(pool.running('a')).toBe(1);
      expect(pool.running('b')).toBe(1);
      expect(children.filter((child) => !child.exited)).toHaveLength(2);
      expect(children.filter((child) => child.exited).every((child) => child.eventNames().length === 0)).toBe(true);
    }
  } finally {
    await pool.close();
  }
  expect(children.every((child) => child.eventNames().length === 0)).toBe(true);
});
