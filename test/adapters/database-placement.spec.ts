import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  InstallationResourceRuntime,
} from '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { DatabasePlacement, resolveDumpExecution } from '../../src/domain/resources/site-process-allocation.js';

it.each([DatabasePlacement.Remote, DatabasePlacement.UnmanagedLocal])(
  'uses the explicit CMS budget without subtracting a fictitious local DB quota for %s', async (databasePlacement) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-placement-'));
    const pool = {
      resize: vi.fn(async () => {}), running: () => 1, failure: () => null, lend: vi.fn(),
    };

    try {
      const runtime = new InstallationResourceRuntime({
        root,
        capacity: 6,
        logicalCpuCount: 6,
        infrastructureCpu: 0,
        cmsCpuBudget: 3.6,
        databasePlacement,
        databaseVersion: 'test',
      }, pool);
      const state = await runtime.read(['a']);

      expect(state.databasePlacement).toBe(databasePlacement);
      expect(state.databaseCpu).toBe(0);
      expect(state.cmsCpu).toBe(3.6);
      expect(state.managed).toBe(false);
      await runtime.change({
        expectedVersion: state.version, databaseCpu: 0, sites: [{ siteId: 'a', processes: 22 }],
      });
      expect(pool.resize).toHaveBeenCalledWith('a', 22);
      const reloaded = await new InstallationResourceRuntime({
        root,
        capacity: 6,
        logicalCpuCount: 6,
        infrastructureCpu: 0,
        cmsCpuBudget: 3.6,
        databasePlacement,
        databaseVersion: 'test',
      }, pool).read(['a']);

      expect(reloaded.sites[0]?.processes).toBe(22);
      expect(() => resolveDumpExecution(reloaded, 'a')).not.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it('preserves site counts when deployment moves a local database to a remote host', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-placement-move-'));

  try {
    await writeFile(path.join(root, 'allocation.json'), JSON.stringify({
      version: 'legacy', databaseCpu: 2, sites: [{ siteId: 'a', processes: 3 }],
    }));
    const pool = { resize: vi.fn(async () => {}), running: () => 3, failure: () => null, lend: vi.fn() };
    const state = await new InstallationResourceRuntime({
      root,
      capacity: 6,
      logicalCpuCount: 6,
      infrastructureCpu: 0,
      databasePlacement: DatabasePlacement.Remote,
      databaseVersion: 'test',
    }, pool).read(['a']);

    expect(state.databaseCpu).toBe(0);
    expect(state.cmsCpu).toBe(6);
    expect(state.version).not.toBe('legacy');
    expect(state.sites).toEqual([{ siteId: 'a', processes: 3 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
