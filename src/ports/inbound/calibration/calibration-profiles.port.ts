import type {
  ICalibrationProfile, ICalibrationProfileDraft,
  ICalibrationProfilePage,
} from '../../../domain/calibration/calibration-profile.js';

export interface ICreateCalibrationProfile {
  execute(input: {
    readonly token: string | null; readonly draft: ICalibrationProfileDraft;
  }): Promise<ICalibrationProfile>;
}

export interface IGetCalibrationProfile {
  execute(input: { readonly token: string | null; readonly profileId: string }): Promise<ICalibrationProfile>;
}

export interface IListCalibrationProfiles {
  execute(input: { readonly token: string | null;
    readonly siteId: string | null;
    readonly cursor: string | null;
    readonly limit: number }): Promise<ICalibrationProfilePage>;
}

export interface IUpdateCalibrationProfile {
  execute(input: { readonly token: string | null;
    readonly profileId: string;
    readonly expectedVersion: string;
    readonly draft: ICalibrationProfileDraft }): Promise<ICalibrationProfile>;
}

export interface IDeleteCalibrationProfile {
  execute(input: { readonly token: string | null;
    readonly profileId: string;
    readonly expectedVersion: string }): Promise<void>;
}
