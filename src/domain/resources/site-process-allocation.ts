import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export enum DatabasePlacement {
  ManagedLocal = 'ManagedLocal',
  UnmanagedLocal = 'UnmanagedLocal',
  Remote = 'Remote',
}

export enum DumpExecutionMode {
  BorrowedProcess = 'BorrowedProcess',
  InProcess = 'InProcess',
}

export interface ISiteProcessAllocation {
  readonly siteId: string;
  readonly processes: number;
}

export interface IResourceAllocation {
  readonly capacity: number;
  readonly databaseCpu: number;
  readonly infrastructureCpu: number;
  readonly cmsCpuBudget?: number;
  readonly sites: readonly ISiteProcessAllocation[];
}

export function validateResourceAllocation(value: IResourceAllocation): void {
  if (
    !Number.isFinite(value.capacity)
    || value.capacity <= 0
    || !Number.isFinite(value.databaseCpu)
    || value.databaseCpu < 0
    || value.databaseCpu > value.capacity
    || !Number.isFinite(value.infrastructureCpu)
    || value.infrastructureCpu < 0
    || value.infrastructureCpu >= value.capacity
    || value.cmsCpuBudget !== undefined
    && (!Number.isFinite(value.cmsCpuBudget)
    || value.cmsCpuBudget <= 0)
    || new Set(value.sites.map((site) => site.siteId)).size !== value.sites.length
    || value.sites.some((site) => !site.siteId || !Number.isSafeInteger(site.processes) || site.processes < 1)
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid installation resource allocation');
  }
}

export function unallocatedCpu(value: IResourceAllocation): number {
  validateResourceAllocation(value);

  return Math.max(0, Math.min(value.capacity - value.databaseCpu - value.infrastructureCpu,
    value.cmsCpuBudget ?? value.capacity) - value.sites.reduce((sum, site) => sum + site.processes, 0));
}

export function resolveDumpExecution(value: IResourceAllocation, siteId: string): DumpExecutionMode {
  validateResourceAllocation(value);
  const site = value.sites.find((entry) => entry.siteId === siteId);

  if (!site) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Site allocation not found');
  }
  if (site.processes >= 2) {
    return DumpExecutionMode.BorrowedProcess;
  }

  return DumpExecutionMode.InProcess;
}
