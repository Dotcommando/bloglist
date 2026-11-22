import type { IInstallationResourceState } from '../../../domain/resources/installation-resources.js';
import type { ISiteProcessAllocation } from '../../../domain/resources/site-process-allocation.js';
import type { ICalibrationResourceLease } from '../calibration/calibration-runtime.port.js';

export interface IResourceChange {
  readonly cmsCpu?: number;
  readonly expectedVersion: string;
  readonly databaseCpu: number;
  readonly sitePoolSize?: number;
  readonly sites: readonly ISiteProcessAllocation[];
}

export interface IInstallationResourcesPort {
  beginCalibration?(): Promise<ICalibrationResourceLease>;
  read(siteIds: readonly string[]): Promise<IInstallationResourceState>;
  change(input: IResourceChange): Promise<void>;
}
