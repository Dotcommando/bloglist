import type { ICalibrationApiStep } from './calibration-addon.js';

export enum CalibrationScope {
  Site = 'Site',
  Installation = 'Installation',
}

export enum CalibrationPageReferenceKind {
  RelativeUrl = 'RelativeUrl',
  AbsoluteUrl = 'AbsoluteUrl',
  PageNumber = 'PageNumber',
}

export interface ICalibrationTrafficTarget {
  readonly apiSteps?: readonly ICalibrationApiStep[];
  readonly siteId: string;
  readonly kind: CalibrationPageReferenceKind;
  readonly reference: string;
  /** Integer hundredths of a percent, 0 through 10000. */
  readonly share: number;
}

export interface ICalibrationLatencyCriteria {
  readonly averageMs: number | null;
  readonly medianMs: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
}

export interface ICalibrationSearchSettings {
  readonly concurrencyLevels: readonly number[];
  readonly processCounts: readonly number[];
  readonly poolSizes: readonly number[];
  readonly databaseCpuStep: number;
  readonly warmupSeconds: number;
  readonly probeSeconds: number;
  readonly confirmationSeconds: number;
  readonly maximumSeconds: number;
}

export interface ICalibrationProfileDraft {
  readonly name: string;
  readonly scope: CalibrationScope;
  readonly siteId: string | null;
  readonly distributedCpu: number;
  readonly targets: readonly (Omit<ICalibrationTrafficTarget, 'share'> & { readonly share?: number | null })[];
  readonly criteria: ICalibrationLatencyCriteria;
  readonly search: ICalibrationSearchSettings;
}

export interface ICalibrationProfile extends Omit<ICalibrationProfileDraft, 'targets'> {
  readonly profileId: string;
  readonly version: string;
  readonly targets: readonly ICalibrationTrafficTarget[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ICalibrationProfilePage {
  readonly items: readonly ICalibrationProfile[];
  readonly nextCursor: string | null;
}
