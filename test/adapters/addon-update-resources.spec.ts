import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { InstallationResourceRuntime }
  from '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';

it('reserves rolling replacement capacity against calibration, dumps and allocation changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-update-resources-'));
  const pool = {
    resize: vi.fn(async () => {}),
    running: () => 1,
    failure: () => null,
    lend: vi.fn(async () => async () => {}),
  };
  const runtime = new InstallationResourceRuntime({
    root,
    capacity: 4,
    cmsCpuBudget: 4,
    logicalCpuCount: 4,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.UnmanagedLocal,
    databaseVersion: 'test',
  }, pool);

  try {
    const state = await runtime.read(['site']);
    const release = await runtime.beginAddonUpdate();

    await expect(runtime.beginCalibration()).rejects.toMatchObject({ code: 'Conflict' });
    await expect(runtime.reserveForProcess('site', 'owner')).rejects.toMatchObject({ code: 'Conflict' });
    await expect(runtime.change({ expectedVersion: state.version, databaseCpu: 0, sites: state.sites }))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect((await runtime.read(['site'])).version).toBe(state.version);
    await release();
    await expect(runtime.change({ expectedVersion: state.version, databaseCpu: 0, sites: state.sites }))
      .resolves.toBeUndefined();
    await release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
