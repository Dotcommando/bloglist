export enum ResourceDumpMode {
  BorrowedProcess = 'BorrowedProcess',
  InProcess = 'InProcess',
}

interface IResourcePreviewInput {
  readonly capacity: number;
  readonly infrastructureCpu: number;
  readonly cmsCpu: number;
  readonly cmsCpuBudget: number | null;
  readonly managed: boolean;
  readonly sites: readonly { readonly siteId: string; readonly processes: number; readonly running: number }[];
}

export interface IResourceAllocationPreview {
  readonly total: number;
  readonly savedTotal: number;
  readonly runningTotal: number;
  readonly cmsCpu: number;
  readonly recommendation: number;
  readonly unallocated: number;
  readonly aboveRecommendation: boolean;
  readonly dumpMode: ResourceDumpMode;
}

export function resourceAllocationPreview(saved: IResourcePreviewInput, databaseCpu: number,
  counts: Readonly<Record<string, number>>, siteId: string): IResourceAllocationPreview {
  const total = saved.sites.reduce((sum, site) => sum + (counts[site.siteId] ?? site.processes), 0);
  const planned = saved.capacity <= 1 ? saved.capacity
    : Math.max(0, saved.capacity - databaseCpu - saved.infrastructureCpu);
  const cmsCpu = saved.managed ? planned : Math.min(planned, saved.cmsCpuBudget ?? saved.cmsCpu);
  const unallocated = Math.round(Math.max(0, cmsCpu - total) * 1e9) / 1e9;
  const processes = counts[siteId] ?? saved.sites.find((site) => site.siteId === siteId)?.processes ?? 1;

  return {
    total,
    savedTotal: saved.sites.reduce((sum, site) => sum + site.processes, 0),
    runningTotal: saved.sites.reduce((sum, site) => sum + site.running, 0),
    cmsCpu,
    recommendation: Math.ceil(cmsCpu),
    unallocated,
    aboveRecommendation: total > Math.ceil(cmsCpu),
    dumpMode: processes >= 2 ? ResourceDumpMode.BorrowedProcess : ResourceDumpMode.InProcess,
  };
}
