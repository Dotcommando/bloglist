import type { ICalibrationSiteAddon } from '../calibration/calibration-addon.js';
import type { IInstallationProcess } from './installation-process.js';
import type { DatabasePlacement, DumpExecutionMode, IResourceAllocation } from './site-process-allocation.js';

export interface IInstallationResourceState extends IResourceAllocation {
  readonly processes?: readonly IInstallationProcess[];
  readonly databasePools?: {
    readonly sitePoolSize: number;
    readonly appliedSitePoolSize: number | null;
    readonly coordinatorPoolSize: number;
    readonly editable: boolean;
  };
  readonly version: string;
  readonly databasePlacement: DatabasePlacement;
  readonly logicalCpuCount: number;
  readonly cmsCpu: number;
  readonly databaseEngine: string;
  readonly databaseVersion: string | null;
  readonly databaseImage: string | null;
  readonly observedDatabaseCpu: number | null;
  readonly observedCmsCpu: number | null;
  readonly managed: boolean;
  readonly applyError: string | null;
  readonly activeDump: boolean;
  readonly dumpSiteId?: string | null;
  readonly running: Readonly<Record<string, number>>;
  readonly processErrors: Readonly<Record<string, string | null>>;
}

export interface IInstallationResourceView extends IInstallationResourceState {
  readonly recommendation: number;
  readonly unallocated: number;
  readonly allocationEditable: boolean;
  readonly siteDetails: readonly {
    readonly siteId: string;
    readonly name: string;
    readonly domain: string;
    readonly dumpMode: DumpExecutionMode;
    readonly addons?: readonly ICalibrationSiteAddon[];
  }[];
}
