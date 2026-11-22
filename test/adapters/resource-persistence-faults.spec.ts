import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { InstallationResourceRuntime } from
  '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof fs>();

  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});

it.each(['ENOSPC', 'EACCES', 'rename'])('keeps saved settings unchanged after storage failure: %s', async (fault) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zarya-persist-fault-'));
  const pool = { resize: vi.fn(async () => {}), running: () => 1, failure: () => null, lend: vi.fn() };
  const settings = {
    root,
    capacity: 6,
    logicalCpuCount: 6,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
  };
  const runtime = new InstallationResourceRuntime(settings, pool);

  try {
    const initial = await runtime.read(['a']);
    const saved = await fs.readFile(path.join(root, 'allocation.json'), 'utf8');
    const operation = fault === 'rename' ? vi.mocked(fs.rename) : vi.mocked(fs.writeFile);

    operation.mockRejectedValueOnce(Object.assign(new Error('synthetic storage failure'), { code: fault }));
    const change = { expectedVersion: initial.version, databaseCpu: 1, sites: [{ siteId: 'a', processes: 3 }] };

    await expect(runtime.change(change)).rejects.toThrow('synthetic');
    const failed = await runtime.read(['a']);

    expect(failed.version).toBe(initial.version);
    expect(failed.sites).toEqual(initial.sites);
    expect(failed.applyError).toContain('persist');
    expect(pool.resize).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(path.join(root, 'allocation.json'), 'utf8')).toBe(saved);
    expect(await fs.readdir(root)).toEqual(['allocation.json']);
    await runtime.change(change);
    const restarted = new InstallationResourceRuntime(settings, pool);

    expect((await restarted.read(['a'])).sites).toEqual(change.sites);
  } finally {
    vi.clearAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('does not expose a newly discovered site allocation when saving it fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zarya-new-site-save-'));
  const pool = { resize: vi.fn(async () => {}), running: () => 1, failure: () => null, lend: vi.fn() };
  const runtime = new InstallationResourceRuntime({
    root,
    capacity: 6,
    logicalCpuCount: 6,
    infrastructureCpu: 0,
    databasePlacement: DatabasePlacement.ManagedLocal,
    databaseVersion: 'test',
  }, pool);

  try {
    const initial = await runtime.read(['a']);

    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('synthetic write failure'));
    await expect(runtime.read(['a', 'b'])).rejects.toThrow('synthetic');
    const saved = await runtime.read(['a']);

    expect(saved.version).toBe(initial.version);
    expect(saved.sites).toEqual(initial.sites);
    expect((await runtime.read(['a', 'b'])).sites.map((site) => site.siteId)).toEqual(['a', 'b']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('fails closed on corrupt saved configuration without overwriting it or starting workers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zarya-corrupt-allocation-'));
  const pool = { resize: vi.fn(), running: () => 0, failure: () => null, lend: vi.fn() };

  try {
    await fs.writeFile(path.join(root, 'allocation.json'), '{broken');
    const runtime = new InstallationResourceRuntime({
      root,
      capacity: 6,
      logicalCpuCount: 6,
      infrastructureCpu: 0,
      databasePlacement: DatabasePlacement.ManagedLocal,
      databaseVersion: 'test',
    }, pool);

    await expect(runtime.read(['a'])).rejects.toThrow();
    expect(pool.resize).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(root, 'allocation.json'), 'utf8')).toBe('{broken');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
