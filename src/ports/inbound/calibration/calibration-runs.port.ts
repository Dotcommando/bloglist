import type { ICalibrationMeasurement, ICalibrationRun } from '../../../domain/calibration/calibration-run.js';
import type { IInstallationResourceState } from '../../../domain/resources/installation-resources.js';

export interface IStartCalibrationRun {
  execute(input: { readonly token: string | null; readonly profileId: string; readonly expectedVersion: string }):
  Promise<ICalibrationRun>;
}

export interface IReadCalibrationRuns {
  execute(input: { readonly token: string | null; readonly siteId: string | null }):
  Promise<readonly ICalibrationRun[]>;
  detail(input: { readonly token: string | null; readonly runId: string }):
  Promise<{ readonly run: ICalibrationRun; readonly measurements: readonly ICalibrationMeasurement[] }>;
}

export interface ICancelCalibrationRun {
  execute(input: { readonly token: string | null; readonly runId: string }): Promise<void>;
}

export interface IApplyCalibrationResult {
  execute(input: { readonly token: string | null; readonly runId: string; readonly expectedVersion: string }):
  Promise<IInstallationResourceState>;
}
