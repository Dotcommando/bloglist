export interface ICalibrationAddonQuery {
  readonly queryId: string;
  readonly path: string;
}

export interface ICalibrationApiStep {
  readonly addonKey: string;
  readonly queryId: string;
}

export interface ICalibrationSiteAddon {
  readonly addonKey: string;
  readonly implementationVersion: string;
  readonly runtimeDigest: string;
  readonly configurationHash: string;
  readonly queries: readonly ICalibrationAddonQuery[];
}

export interface ICalibrationAddonSnapshot {
  readonly siteId: string;
  readonly addons: readonly ICalibrationSiteAddon[];
}
