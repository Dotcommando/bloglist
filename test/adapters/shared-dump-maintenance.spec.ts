import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { SharedDumpMaintenance } from '../../src/adapters/outbound/backup/files/shared-dump-maintenance.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function pair(): Promise<readonly [SharedDumpMaintenance, SharedDumpMaintenance, ReturnType<typeof vi.fn>]> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-shared-gate-'));

  roots.push(root);
  const invalidate = vi.fn();

  return [new SharedDumpMaintenance(root), new SharedDumpMaintenance(root, invalidate), invalidate] as const;
}

it('drains another process admission before capture and blocks new writes globally', async () => {
  const [first, second] = await pair();
  const release = second.enter();
  let started = false;
  const capture = first.run(async () => {
    started = true;
    expect(second.captureActive).toBe(true);
    expect(() => second.enter()).toThrow();
    second.enter(true)();
  }, true);

  expect(started).toBe(false);
  expect(() => second.enter(true)).toThrow();
  release();
  await capture;
  expect(started).toBe(true);
  second.enter()();
});

it('restoration closes reads and writes in other processes and invalidates their caches', async () => {
  const [first, second, invalidate] = await pair();

  second.enter(true)();
  await first.run(async () => {
    expect(() => second.enter(true)).toThrow();
    expect(() => second.enter()).toThrow();
  });
  second.enter(true)();
  expect(invalidate).toHaveBeenCalled();
});

it('propagates capture rejection, releases admission and retains fail-closed state globally', async () => {
  const [first, second] = await pair();

  await expect(first.run(async () => {
    throw new Error('capture failed');
  }, true)).rejects.toThrow('capture failed');
  second.enter()();
  first.failClosed();
  expect(() => second.enter(true)).toThrow();
  await expect(second.run(async () => {})).rejects.toThrow();
});

it('reopens capture admission only after a dead requester and its operation are reconciled', async () => {
  const [first, second] = await pair();
  const statePath = path.join(roots.at(-1)!, 'state.json');

  await writeFile(statePath, JSON.stringify({ version: 'test', owner: 99999999, readable: true, failed: false }));
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  });

  try {
    const cleanup = vi.fn(async () => {
      expect(() => second.enter(true)).toThrow();
    });

    await first.recoverCaptureOwner(99999999, cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
    second.enter()();
    await writeFile(statePath, JSON.stringify({ version: 'test', owner: 99999999, readable: true, failed: false }));
    await expect(first.recoverCaptureOwner(99999999, async () => {
      throw new Error('uncertain operation');
    })).rejects.toThrow('uncertain operation');
    expect(() => second.enter(true)).toThrow();
  } finally {
    kill.mockRestore();
  }
});
