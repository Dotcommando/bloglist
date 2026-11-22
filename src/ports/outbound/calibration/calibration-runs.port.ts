import type { ICalibrationMeasurement, ICalibrationRun } from '../../../domain/calibration/calibration-run.js';

export interface ICalibrationRunsPort {
  create(run: ICalibrationRun): Promise<void>;
  save(run: ICalibrationRun): Promise<void>;
  get(runId: string): Promise<ICalibrationRun | null>;
  latest(siteId: string | null, limit: number): Promise<readonly ICalibrationRun[]>;
  append(measurement: ICalibrationMeasurement): Promise<void>;
  measurements(runId: string): Promise<readonly ICalibrationMeasurement[]>;
  interruptRunning(at: Date): Promise<void>;
}
