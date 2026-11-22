import type * as FsPromises from 'node:fs/promises';
import os from 'node:os';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readProcessSupervisorSettings } from '../../src/infra/resources/process-supervisor.settings.js';

const files = vi.hoisted(() => ({
  quota: '1900000 100000',
  affinity: 'Cpus_allowed_list:\t0-19\n',
  legacy: false,
  missingAffinity: false,
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

vi.mock('node:fs/promises', async (original) => ({
  ...await original<typeof FsPromises>(),
  readFile: vi.fn(async (file: string) => {
    if (
      file === '/proc/self/status'
      && files.missingAffinity
      || file === '/sys/fs/cgroup/cpu.max'
      && files.legacy
    ) {
      throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    }
    if (file === '/sys/fs/cgroup/cpu/cpu.cfs_quota_us') {
      return files.quota.split(' ')[0];
    }
    if (file === '/sys/fs/cgroup/cpu/cpu.cfs_period_us') {
      return files.quota.split(' ')[1];
    }

    return file === '/private/key' ? 'a'.repeat(64)
      : file === '/proc/self/status' ? files.affinity : files.quota;
  }),
}));

beforeEach(() => {
  files.quota = '1900000 100000';
  files.legacy = false;
  files.missingAffinity = false;
  files.affinity = 'Cpus_allowed_list:\t0-19\n';
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  vi.restoreAllMocks();
});

it('keeps the installation budget separate from the CMS container CPU quota', async () => {
  const cpu = os.cpus()[0]!;

  vi.spyOn(os, 'cpus').mockReturnValue(Array.from({ length: 20 }, () => cpu));
  vi.spyOn(os, 'availableParallelism').mockReturnValue(19);
  vi.spyOn(process, 'constrainedMemory').mockReturnValue(6 * 1024 ** 3);

  const settings = await readProcessSupervisorSettings({
    ZARYA_INSTALLATION_CPU_BUDGET: '20',
    ZARYA_DATABASE_PLACEMENT: 'ManagedLocal',
    ZARYA_RESOURCE_SOCKET: '/private/resources.sock',
    ZARYA_RESOURCE_SECRET_FILE: '/private/key',
  });

  expect(settings.capacity).toBe(20);
  expect(settings).not.toHaveProperty('maximumWorkers');
  const unmanaged = await readProcessSupervisorSettings({
    ZARYA_INSTALLATION_CPU_BUDGET: '20',
    ZARYA_DATABASE_PLACEMENT: 'Remote',
  });

  expect(unmanaged.cmsCpuBudget).toBe(19);
  await expect(readProcessSupervisorSettings({
    ZARYA_INSTALLATION_CPU_BUDGET: '21',
    ZARYA_DATABASE_PLACEMENT: 'Remote',
  })).rejects.toThrow();
});

it('requires explicit placement and an explicit application budget for an unmanaged local DB', async () => {
  await expect(readProcessSupervisorSettings({})).rejects.toThrow('placement');
  await expect(readProcessSupervisorSettings({ ZARYA_DATABASE_PLACEMENT: 'UnmanagedLocal' }))
    .rejects.toThrow('CMS CPU budget');
  const settings = await readProcessSupervisorSettings({
    ZARYA_DATABASE_PLACEMENT: 'UnmanagedLocal',
    ZARYA_CMS_CPU_BUDGET: '0.5',
    ZARYA_PROCESS_MEMORY_BUDGET_MB: '1',
    ZARYA_PROCESS_CONNECTION_BUDGET: '1',
  });

  expect(settings.databasePlacement).toBe('UnmanagedLocal');
  expect(settings.cmsCpuBudget).toBe(0.5);
  expect(settings).not.toHaveProperty('maximumWorkers');
});

it.each([
  ['150000 100000', '0-1', 1.5],
  ['150000 100000', '1', 1],
  ['350000 100000', '0,2-3', 3],
  ['10000 100000', '0-1', 0.1],
])('detects the unrounded CPU quota %s within affinity %s', async (quota, affinity, budget) => {
  const cpu = os.cpus()[0]!;

  vi.spyOn(os, 'cpus').mockReturnValue(Array.from({ length: 4 }, () => cpu));
  vi.spyOn(os, 'availableParallelism').mockReturnValue(1);
  files.quota = quota;
  files.affinity = 'Cpus_allowed_list:\t' + affinity + '\n';
  const settings = await readProcessSupervisorSettings({
    ZARYA_INSTALLATION_CPU_BUDGET: '4',
    ZARYA_DATABASE_PLACEMENT: 'Remote',
    ZARYA_CMS_CPU_BUDGET: String(budget),
  });

  expect(settings.cmsCpuBudget).toBe(budget);
  const detected = await readProcessSupervisorSettings({
    ZARYA_INSTALLATION_CPU_BUDGET: '4',
    ZARYA_DATABASE_PLACEMENT: 'ManagedLocal',
  });

  expect(detected.cmsCpuBudget).toBe(budget);
});

it('detects a fractional legacy cgroup quota without losing affinity limits', async () => {
  vi.spyOn(os, 'availableParallelism').mockReturnValue(1);
  files.legacy = true;
  files.quota = '150000 100000';
  files.affinity = 'Cpus_allowed_list:\t0-1\n';
  const settings = await readProcessSupervisorSettings({ ZARYA_DATABASE_PLACEMENT: 'Remote' });

  expect(settings.cmsCpuBudget).toBe(1.5);
});

it('uses native available parallelism outside Linux without reading cgroups', async () => {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' });
  vi.spyOn(os, 'availableParallelism').mockReturnValue(1);
  files.quota = 'invalid';
  files.affinity = 'invalid';
  const settings = await readProcessSupervisorSettings({ ZARYA_DATABASE_PLACEMENT: 'Remote' });

  expect(settings.cmsCpuBudget).toBe(1);
});

it('retains available parallelism when no readable affinity mask or quota exists', async () => {
  vi.spyOn(os, 'availableParallelism').mockReturnValue(1);
  files.missingAffinity = true;
  files.quota = 'max 100000';
  const settings = await readProcessSupervisorSettings({ ZARYA_DATABASE_PLACEMENT: 'Remote' });

  expect(settings.cmsCpuBudget).toBe(1);
});
