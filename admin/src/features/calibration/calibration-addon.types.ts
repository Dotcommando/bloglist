export interface ICalibrationSiteAddon {
  addonKey: string;
  implementationVersion: string;
  runtimeDigest: string;
  configurationHash: string;
  queries: { queryId: string; path: string }[];
}

export interface ICalibrationAddonSnapshot {
  siteId: string;
  addons: ICalibrationSiteAddon[];
}
