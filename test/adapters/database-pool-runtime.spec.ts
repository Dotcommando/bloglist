import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { InstallationResourceRuntime } from
  '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';

it('persists the site pool independently, reports failed application and reapplies it after restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-pool-runtime-'));
  const pool = {
    resize: vi.fn(async () => {}),
    running: () => 1,
    failure: () => null,
    lend: vi.fn(async () => async () => {}),
  };
  let applied = 5;
  const databasePools = {
    configure: vi.fn(async (size: number) => {
      applied = size;
    }),
    applied: (size: number) => size === applied,
  };
  const settings = {
    root,
    capacity: 2,
    logicalCpuCount: 2,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
  };

  try {
    const runtime = new InstallationResourceRuntime(settings, pool, undefined, databasePools);
    const initial = await runtime.read(['a']);

    expect(initial.databasePools).toMatchObject({ sitePoolSize: 5, coordinatorPoolSize: 5, editable: true });
    databasePools.configure.mockRejectedValueOnce(new Error('synthetic startup failure'));
    await expect(runtime.change({
      expectedVersion: initial.version, databaseCpu: 1, sites: initial.sites, sitePoolSize: 3,
    })).rejects.toThrow();
    const failed = await runtime.read(['a']);

    expect(failed.applyError).toBeTruthy();
    expect(failed.databasePools).toMatchObject({ sitePoolSize: 3, appliedSitePoolSize: null });
    const restarted = new InstallationResourceRuntime(settings, pool, undefined, databasePools);
    const restored = await restarted.read(['a']);

    expect(restored.databasePools).toMatchObject({ sitePoolSize: 3, appliedSitePoolSize: 3 });
    expect(databasePools.configure).toHaveBeenLastCalledWith(3);
    const lease = await restarted.reserveForProcess('a', 'owner');

    await expect(restarted.change({
      expectedVersion: restored.version, databaseCpu: 1, sites: restored.sites, sitePoolSize: 4,
    })).rejects.toThrow();
    await lease.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
