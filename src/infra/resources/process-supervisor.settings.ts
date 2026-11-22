import { readFile } from 'node:fs/promises';
import os from 'node:os';

import { DatabasePlacement } from '../../domain/resources/site-process-allocation.js';
import type { IProcessSupervisorSettings } from './process-supervisor.js';

export async function readProcessSupervisorSettings(environment: NodeJS.ProcessEnv):
Promise<IProcessSupervisorSettings> {
  const affinity = os.availableParallelism();
  let detected = affinity;

  if (process.platform === 'linux') {
    // availableParallelism may already round the quota; read the affinity mask independently.
    let allowedCpuCount = affinity;

    try {
      const status = await readFile('/proc/self/status', 'utf8');
      const mask = /^Cpus_allowed_list:[ \t]*([0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)[ \t]*$/m.exec(status);

      if (mask?.[1]) {
        allowedCpuCount = mask[1].split(',').reduce((count, range) => {
          const [first, last = first] = range.split('-').map(Number);

          if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last! < first!) {
            throw new Error('Invalid process CPU affinity');
          }

          return count + last! - first! + 1;
        }, 0);
        allowedCpuCount = Math.min(os.cpus().length, allowedCpuCount);
      }
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      const fields = (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim().split(/\s+/);

      if (fields[0] !== 'max' && Number(fields[0]) > 0 && Number(fields[1]) > 0) {
        detected = Math.min(allowedCpuCount, Number(fields[0]) / Number(fields[1]));
      }
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }

      try {
        const quota = Number(await readFile('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf8'));
        const period = Number(await readFile('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf8'));

        if (quota > 0 && period > 0) {
          detected = Math.min(allowedCpuCount, quota / period);
        }
      } catch (legacyError) {
        if (!(legacyError instanceof Error) || !('code' in legacyError) || legacyError.code !== 'ENOENT') {
          throw legacyError;
        }
      }
    }
  }

  const databasePlacement = Object.values(DatabasePlacement)
    .find((entry) => entry === environment.ZARYA_DATABASE_PLACEMENT);

  if (!databasePlacement) {
    throw new Error('Explicit database placement is required: ManagedLocal, UnmanagedLocal or Remote');
  }

  const configuredCmsCpu = environment.ZARYA_CMS_CPU_BUDGET?.trim() || undefined;

  if (databasePlacement === DatabasePlacement.UnmanagedLocal && configuredCmsCpu === undefined) {
    throw new Error('An unmanaged local database requires an explicit CMS CPU budget');
  }

  const cmsCpuBudget = configuredCmsCpu === undefined ? undefined : Number(configuredCmsCpu);
  const capacity = Number(environment.ZARYA_INSTALLATION_CPU_BUDGET ?? detected);
  const infrastructureCpu = Number(environment.ZARYA_INFRASTRUCTURE_CPU_RESERVE ?? '0');

  if (
    !Number.isFinite(capacity)
    || capacity <= 0
    || capacity > os.cpus().length
    || !Number.isFinite(infrastructureCpu)
    || infrastructureCpu < 0
    || infrastructureCpu >= capacity
    || cmsCpuBudget !== undefined
    && (!Number.isFinite(cmsCpuBudget)
    || cmsCpuBudget <= 0
    || cmsCpuBudget > detected)
  ) {
    throw new Error('Invalid installation CPU budget');
  }

  const socket = environment.ZARYA_RESOURCE_SOCKET;
  const secretFile = environment.ZARYA_RESOURCE_SECRET_FILE;

  if (socket && databasePlacement !== DatabasePlacement.ManagedLocal) {
    throw new Error('Database resource control requires ManagedLocal placement');
  }
  if (!!socket !== !!secretFile) {
    throw new Error('Resource control requires both an explicit socket and private key file');
  }

  const secret = secretFile ? (await readFile(secretFile, 'utf8')).trim() : undefined;

  if (secret !== undefined && !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('Invalid resource-control key');
  }

  return {
    ...(cmsCpuBudget !== undefined ? { cmsCpuBudget } : !socket ? { cmsCpuBudget: detected } : {}),
    databasePlacement,
    capacity,
    infrastructureCpu,
    ...(socket && secret ? { resourceSocket: socket, resourceSecret: secret } : {}),
  };
}
