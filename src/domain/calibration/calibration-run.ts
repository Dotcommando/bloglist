import type { IInstallationResourceState } from '../resources/installation-resources.js';
import type { ISiteProcessAllocation } from '../resources/site-process-allocation.js';
import type { ICalibrationAddonSnapshot } from './calibration-addon.js';
import type { ICalibrationProfile } from './calibration-profile.js';

export enum CalibrationRunStatus {
  Running = 'Running', Completed = 'Completed', Cancelled = 'Cancelled', Failed = 'Failed',
  RestorationRequired = 'RestorationRequired', Interrupted = 'Interrupted',
}

export enum CalibrationMeasurementKind { Reference = 'Reference', Probe = 'Probe', Confirmation = 'Confirmation' }

export interface ICalibrationConfiguration {
  readonly databaseCpu: number;
  readonly cmsCpu: number;
  readonly sitePoolSize: number;
  readonly sites: readonly ISiteProcessAllocation[];
}

export interface ICalibrationResolvedTarget {
  readonly apiSteps?: readonly { readonly addonKey: string; readonly queryId: string; readonly path: string }[];
  readonly siteId: string;
  readonly authority: string;
  readonly path: string;
  readonly share: number;
  readonly effectiveShare: number;
  readonly releaseId: string;
}

export interface ICalibrationMetrics {
  readonly averageMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly requests: number;
  readonly errors: number;
  readonly dropped: number;
  readonly successfulRps: number;
}

export interface ICalibrationMeasurement {
  readonly measurementId: string;
  readonly runId: string;
  readonly kind: CalibrationMeasurementKind;
  readonly configuration: ICalibrationConfiguration;
  readonly observed: IInstallationResourceState;
  readonly concurrency: number;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly metrics: ICalibrationMetrics;
  readonly siteMetrics: Readonly<Record<string, ICalibrationMetrics>>;
  readonly stepMetrics?: Readonly<Record<string, ICalibrationMetrics>>;
  readonly passed: boolean;
}

export interface ICalibrationRun {
  readonly addonSnapshots?: readonly ICalibrationAddonSnapshot[];
  readonly runId: string;
  readonly profile: ICalibrationProfile;
  readonly siteIds: readonly string[];
  readonly cmsVersion: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: CalibrationRunStatus;
  readonly phase: string;
  readonly targets: readonly ICalibrationResolvedTarget[];
  readonly original: ICalibrationConfiguration;
  readonly generatorPlacement: string;
  readonly referenceId: string | null;
  readonly winnerId: string | null;
  readonly restored: boolean;
  readonly error: string | null;
}
