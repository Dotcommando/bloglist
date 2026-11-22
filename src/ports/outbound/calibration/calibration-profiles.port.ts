import type { ICalibrationProfile, ICalibrationProfilePage } from '../../../domain/calibration/calibration-profile.js';

export interface ICalibrationProfileQuery {
  readonly siteId: string | null;
  readonly cursor: string | null;
  readonly limit: number;
}

export interface ICalibrationProfilesPort {
  create(profile: ICalibrationProfile): Promise<void>;
  get(profileId: string): Promise<ICalibrationProfile | null>;
  list(query: ICalibrationProfileQuery): Promise<ICalibrationProfilePage>;
  replace(profile: ICalibrationProfile, expectedVersion: string): Promise<void>;
  remove(profileId: string, expectedVersion: string, deletedAt: Date): Promise<void>;
}

export interface ICalibrationValuesPort {
  now(): Date;
  nextId(): string;
  nextVersion(): string;
}
