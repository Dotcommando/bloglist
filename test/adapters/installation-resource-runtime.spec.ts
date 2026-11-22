import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  InstallationResourceRuntime,
} from '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';

it('persists defaults, accepts fractional remainder and serializes dump admission against edits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-resource-runtime-'));
  const running = new Map<string, number>();
  const pool = {
    resize: vi.fn(async (siteId: string, count: number) => {
      running.set(siteId, count);
    }),
    running: (siteId: string) => running.get(siteId) ?? 0,
    failure: () => null,
    lend: vi.fn(async () => vi.fn(async () => {})),
  };
  const settings = {
    capacity: 6,
    logicalCpuCount: 6,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
    root,
  };
  const control = {
    observe: async () => ({ databaseCpu: 2.4, cmsCpu: 3.6, databaseImage: 'test' }),
    apply: async () => ({ databaseCpu: 2.4, cmsCpu: 3.6, databaseImage: 'test' }),
  };

  try {
    const runtime = new InstallationResourceRuntime(settings, pool, control);
    const initial = await runtime.read(['a', 'b']);

    await runtime.change({
      expectedVersion: initial.version,
      databaseCpu: 2.4,
      sites: [{ siteId: 'a', processes: 22 }, { siteId: 'b', processes: 1 }],
    });
    expect(pool.resize).toHaveBeenCalledWith('a', 22);
    const expanded = await runtime.read(['a', 'b']);

    await runtime.change({
      expectedVersion: expanded.version,
      databaseCpu: 2.4,
      sites: [{ siteId: 'a', processes: 1 }, { siteId: 'b', processes: 2 }],
    });
    const lease = await runtime.reserveForProcess('a', 'owner');

    expect(lease.mode).toBe('InProcess');
    await expect(runtime.reserveForProcess('b', 'owner')).rejects.toThrow();
    await expect(runtime.change({
      expectedVersion: (await runtime.read(['a', 'b'])).version,
      databaseCpu: 3,
      sites: initial.sites,
    })).rejects.toThrow();
    await lease.release();
    const borrowed = await runtime.reserveForProcess('b', 'owner');

    expect(borrowed.mode).toBe('BorrowedProcess');
    expect(pool.lend).toHaveBeenCalledWith('b', 'owner');
    await borrowed.release();
    const restarted = new InstallationResourceRuntime(settings, pool, control);

    expect((await restarted.read(['a', 'b'])).sites).toEqual([
      { siteId: 'a', processes: 1 }, { siteId: 'b', processes: 2 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
