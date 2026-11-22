import type { ICalibrationProfile } from '../../../domain/calibration/calibration-profile.js';
import type { ICalibrationConfiguration, ICalibrationMetrics, ICalibrationResolvedTarget } from
  '../../../domain/calibration/calibration-run.js';
import type { IInstallationResourceState } from '../../../domain/resources/installation-resources.js';

export interface ICalibrationResourceLease {
  readonly original: ICalibrationConfiguration;
  read(): Promise<IInstallationResourceState>;
  apply(configuration: ICalibrationConfiguration): Promise<IInstallationResourceState>;
  restore(): Promise<void>;
}

export interface ICalibrationPageResolverPort {
  resolve(profile: ICalibrationProfile, token: string | null): Promise<readonly ICalibrationResolvedTarget[]>;
}

export interface ICalibrationLoadPort {
  readonly placement: string;
  readonly sharesCmsBudget: boolean;
  measure(input: {
    readonly targets: readonly ICalibrationResolvedTarget[];
    readonly concurrency: number;
    readonly warmupSeconds: number;
    readonly seconds: number;
  }, signal: AbortSignal): Promise<{
    readonly metrics: ICalibrationMetrics;
    readonly siteMetrics: Readonly<Record<string, ICalibrationMetrics>>;
    readonly stepMetrics?: Readonly<Record<string, ICalibrationMetrics>>;
  }>;
}
