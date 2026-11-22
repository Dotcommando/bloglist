import * as fs from 'node:fs/promises';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { InstallationResourceRuntime } from
  '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof fs>(),
}));

it('removes an incomplete calibration journal after a failed write and can retry without restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-calibration-journal-'));
  const counts = new Map<string, number>();
  const pool = {
    resize: vi.fn(async (id: string, count: number) => {
      counts.set(id, count);
    }),
    running: (id: string) => counts.get(id) ?? 0,
    failure: () => null,
    lend: vi.fn(async () => async () => {}),
  };
  const settings = {
    root,
    capacity: 4,
    logicalCpuCount: 4,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
  };
  const runtime = new InstallationResourceRuntime(settings, pool);
  const primary = Object.assign(new Error('Synthetic journal disk full'), { code: 'ENOSPC' });
  const original = writeFile;
  let failed = false;

  try {
    const before = await runtime.read(['a']);
    const write = vi.spyOn(fs, 'writeFile').mockImplementation(async (filename, data, options) => {
      if (String(filename).includes('calibration-journal.json') && !failed) {
        failed = true;
        await original(filename, '{"partial":', options);
        throw primary;
      }

      return original(filename, data, options);
    });

    try {
      await expect(runtime.beginCalibration()).rejects.toBe(primary);
    } finally {
      write.mockRestore();
    }
    expect(await readdir(root)).toEqual(['allocation.json']);
    expect((await runtime.read(['a'])).version).toBe(before.version);
    const lease = await runtime.beginCalibration();

    expect(JSON.parse(await readFile(path.join(root, 'calibration-journal.json'), 'utf8')))
      .toMatchObject({ version: before.version, sites: before.sites });
    await lease.restore();
    expect(await readdir(root)).toEqual(['allocation.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('preserves an existing journal when exclusive calibration publication conflicts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-calibration-exclusive-'));
  const runtime = new InstallationResourceRuntime({
    root,
    capacity: 4,
    logicalCpuCount: 4,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
  }, {
    resize: async () => {},
    running: () => 1,
    failure: () => null,
    lend: async () => async () => {},
  });

  try {
    await runtime.read(['a']);
    const retained = await readFile(path.join(root, 'allocation.json'), 'utf8');
    const journal = path.join(root, 'calibration-journal.json');

    await writeFile(journal, retained);
    await expect(runtime.beginCalibration()).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(journal, 'utf8')).toBe(retained);
    expect((await readdir(root)).sort()).toEqual(['allocation.json', 'calibration-journal.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('journals resources, blocks competing operations and restores after restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-calibration-'));
  const counts = new Map<string, number>();
  const pool = {
    resize: vi.fn(async (id: string, n: number) => {
      counts.set(id, n);
    }),
    running: (id: string) => counts.get(id) ?? 0,
    failure: () => null,
    lend: vi.fn(async () => async () => {}),
  };
  const settings = {
    root,
    capacity: 6,
    logicalCpuCount: 6,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
  };
  const control = {
    observe: vi.fn(),
    apply: vi.fn(async (limits: { databaseCpu: number; cmsCpu: number }) => ({ ...limits, databaseImage: 'test' })),
  };
  const pools = { configure: async () => {}, applied: () => true };

  try {
    const runtime = new InstallationResourceRuntime(settings, pool, control, pools);
    const initial = await runtime.read(['a', 'b']);
    const lease = await runtime.beginCalibration();

    await expect(runtime.change({ expectedVersion: initial.version, databaseCpu: 1, sites: initial.sites }))
      .rejects.toThrow();
    await expect(runtime.reserveForProcess('a', 'owner')).rejects.toThrow();
    const observed = await lease.apply({
      ...lease.original,
      databaseCpu: 1.2,
      cmsCpu: 2.8,
      sites: [{ siteId: 'a', processes: 3 }, { siteId: 'b', processes: 1 }],
    });

    expect(observed.cmsCpu).toBe(2.8);
    expect(observed.observedCmsCpu).toBe(2.8);
    expect(JSON.parse(await readFile(path.join(root, 'calibration-journal.json'), 'utf8')))
      .toMatchObject({ databaseCpu: 1, sites: initial.sites });
    const restarted = new InstallationResourceRuntime(settings, pool, control, pools);
    const restored = await restarted.read(['a', 'b']);

    expect(restored.sites).toEqual(initial.sites);
    expect(restored.cmsCpu).toBe(5);
    expect(restored.databaseCpu).toBe(1);
    await expect(readFile(path.join(root, 'calibration-journal.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
