export enum CalibrationScope { Site = 'Site', Installation = 'Installation' }

export enum CalibrationReferenceKind {
  RelativeUrl = 'RelativeUrl', AbsoluteUrl = 'AbsoluteUrl', PageNumber = 'PageNumber',
}

import type { ICalibrationAddonSnapshot } from './calibration-addon.types.js';

export interface ICalibrationTarget {
  apiSteps?: { addonKey: string; queryId: string }[];
  siteId: string;
  kind: CalibrationReferenceKind;
  reference: string;
  share: number;
}

export interface ICalibrationDraft {
  name: string;
  scope: CalibrationScope;
  siteId: string | null;
  distributedCpu: number;
  targets: ICalibrationTarget[];
  criteria: { averageMs: number | null; medianMs: number | null; p95Ms: number | null; p99Ms: number | null };
  search: { concurrencyLevels: number[];
    processCounts: number[];
    poolSizes: number[];
    databaseCpuStep: number;
    warmupSeconds: number;
    probeSeconds: number;
    confirmationSeconds: number;
    maximumSeconds: number };
}

export interface ICalibrationProfile extends ICalibrationDraft {
  profileId: string; version: string; createdAt: string; updatedAt: string;
}

export interface ICalibrationConfiguration {
  databaseCpu: number; cmsCpu: number; sitePoolSize: number; sites: { siteId: string; processes: number }[];
}

export interface ICalibrationMetrics {
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  requests: number;
  errors: number;
  dropped: number;
  successfulRps: number;
}

export interface ICalibrationRun {
  addonSnapshots?: ICalibrationAddonSnapshot[];
  runId: string;
  profile: ICalibrationProfile;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  phase: string;
  restored: boolean;
  winnerId: string | null;
  referenceId: string | null;
  error: string | null;
  generatorPlacement: string;
}

export interface ICalibrationMeasurement {
  measurementId: string;
  kind: string;
  configuration: ICalibrationConfiguration;
  metrics: ICalibrationMetrics;
  siteMetrics: Record<string, ICalibrationMetrics>;
  stepMetrics?: Record<string, ICalibrationMetrics>;
  concurrency: number;
  passed: boolean;
  startedAt: string;
  finishedAt: string;
}

export interface ICalibrationDetail { run: ICalibrationRun; measurements: ICalibrationMeasurement[] }

export interface ICalibrationRecommendation {
  runId: string; scope: CalibrationScope; siteId: string | null; configuration: ICalibrationConfiguration;
}
