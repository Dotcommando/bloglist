import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { SiteProcessPool } from '../../src/adapters/outbound/runtime/processes/site-process-pool.js';

function fixture(): { children: (EventEmitter & { send: () => boolean; kill: () => boolean; pid: number })[];
  pool: SiteProcessPool } {
  const children: (EventEmitter & { send: () => boolean; kill: () => boolean; pid: number })[] = [];
  const spawn = (): EventEmitter & { send: () => boolean; kill: () => boolean; pid: number } => {
    const child = Object.assign(new EventEmitter(), {
      pid: children.length + 100,
      send: () => {
        queueMicrotask(() => child.emit('exit', 0));

        return true;
      },
      kill: () => {
        queueMicrotask(() => child.emit('exit', 1));

        return true;
      },
    });

    children.push(child);
    queueMicrotask(() => child.emit('message', { kind: 'ready', port: 10000 + children.length }));

    return child;
  };

  return { children, pool: new SiteProcessPool(spawn) };
}

it('routes within each site pool and lends a sibling without losing the request owner', async () => {
  const { pool } = fixture();

  try {
    await pool.resize('a', 1);
    await pool.resize('b', 2);
    const a = pool.select('a');
    const owner = pool.select('b');

    expect(pool.select('a').id).toBe(a.id);
    const restore = await pool.lend('b', owner.id);

    expect(pool.running('a')).toBe(1);
    expect(pool.running('b')).toBe(1);
    expect(pool.select('b').id).toBe(owner.id);
    await restore();
    expect(pool.running('b')).toBe(2);
    expect(pool.running('a')).toBe(1);
  } finally {
    await pool.close();
  }
});

it('lets an active resize own replacement when a serving worker crashes during startup', async () => {
  const children: (EventEmitter & { send(): boolean; kill(): boolean })[] = [];
  const pool = new SiteProcessPool(() => {
    const child = Object.assign(new EventEmitter(), {
      send: () => {
        queueMicrotask(() => child.emit('exit', 0));

        return true;
      },
      kill: () => {
        queueMicrotask(() => child.emit('exit', 1));

        return true;
      },
    });

    children.push(child);

    return child;
  });
  const ready = (child: EventEmitter): void => {
    child.emit('message', { kind: 'ready', port: 10001 });
  };

  try {
    const initial = pool.resize('a', 1);

    ready(children[0]!);
    await initial;
    const changing = pool.resize('a', 2);
    const observed = changing.then(() => null, (error: unknown) => error);

    children[0]!.emit('exit', 1);
    const startedAtCrash = children.length;

    children.slice(1).forEach(ready);
    await Promise.resolve();
    await Promise.resolve();
    children.slice(1).forEach(ready);
    expect(await observed).toBeNull();
    expect(startedAtCrash).toBe(2);
    expect(pool.running('a')).toBe(2);
  } finally {
    await pool.close();
  }
});

it('applies a new database pool by replacing workers only after their successors are ready', async () => {
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 1);
    await pool.resize('b', 2);
    const old = children.slice();

    await pool.configureDatabasePoolSize(3);
    expect(pool.running('a')).toBe(1);
    expect(pool.running('b')).toBe(2);
    expect(pool.hasDatabasePoolSize(3)).toBe(true);
    expect(children).toHaveLength(6);
    expect(old.every((child) => pool.select('a').child !== child && pool.select('b').child !== child)).toBe(true);
    await pool.configureDatabasePoolSize(3);
    expect(children).toHaveLength(6);
  } finally {
    await pool.close();
  }
});

it('retains the old serving worker when a new database-pool worker cannot start', async () => {
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 1);
    const old = pool.select('a');
    const changing = pool.configureDatabasePoolSize(3);
    const observed = expect(changing).rejects.toThrow();

    children.at(-1)!.emit('error', new Error('synthetic startup failure'));
    await observed;
    expect(pool.select('a')).toBe(old);
    expect(pool.hasDatabasePoolSize(3)).toBe(false);
    expect(pool.failure('a')).toBeTruthy();
    await pool.configureDatabasePoolSize(3);
    expect(pool.hasDatabasePoolSize(3)).toBe(true);
    expect(pool.running('a')).toBe(1);
  } finally {
    await pool.close();
  }
});

it('rejects readiness that reports a different actual database pool size', async () => {
  const { pool, children } = fixture();

  try {
    const starting = pool.resize('a', 1);
    const observed = expect(starting).rejects.toThrow();

    children[0]!.emit('message', { kind: 'ready', port: 10001, databasePoolSize: 9 });
    await observed;
    expect(pool.running('a')).toBe(0);
  } finally {
    await pool.close();
  }
});

it('does not fall back to another site and rejects invalid counts', async () => {
  const { pool } = fixture();

  try {
    await pool.resize('b', 1);
    expect(() => pool.select('a')).toThrow();
    await expect(pool.resize('a', 0)).rejects.toThrow();
  } finally {
    await pool.close();
  }
});

it('reports a failed replacement without an unobserved rejection', async () => {
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 2);
    const owner = pool.select('a');
    const restore = await pool.lend('a', owner.id);
    const result = restore();
    const observed = expect(result).rejects.toThrow();

    children.at(-1)!.emit('error', new Error('spawn failed'));
    await observed;
    expect(pool.running('a')).toBe(1);
    expect(pool.failure('a')).toBeTruthy();
  } finally {
    await pool.close();
  }
});

it('restores the full desired pool after the requesting worker dies during borrowed capture', async () => {
  const { pool } = fixture();

  try {
    await pool.resize('a', 2);
    const owner = pool.select('a');
    const restore = await pool.lend('a', owner.id);

    owner.child.emit('exit', 1);
    expect(pool.running('a')).toBe(0);
    await restore();
    expect(pool.running('a')).toBe(2);
  } finally {
    await pool.close();
  }
});

it('delays crash replacement and cancels that delay when the pool closes', async () => {
  vi.useFakeTimers();
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 1);
    children[0]!.emit('exit', 1);
    expect(children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pool.running('a')).toBe(1);
    expect(children).toHaveLength(2);
    children[1]!.emit('exit', 1);
    await pool.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(children).toHaveLength(2);
  } finally {
    vi.useRealTimers();
    await pool.close();
  }
});

it('does not spawn a borrowed replacement after coordinator shutdown has begun', async () => {
  const { pool, children } = fixture();

  try {
    await pool.resize('a', 2);
    const restore = await pool.lend('a', pool.select('a').id);

    pool.beginShutdown();
    await restore();
    expect(children).toHaveLength(2);
    expect(pool.running('a')).toBe(1);
    await expect(pool.resize('a', 3)).rejects.toThrow();
  } finally {
    await pool.close();
  }
});
