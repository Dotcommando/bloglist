import type { ICalibrationSiteAddon } from '../../../domain/calibration/calibration-addon.js';

export interface ISiteResourceCatalogPort {
  list(): Promise<readonly {
    readonly siteId: string;
    readonly addons?: readonly ICalibrationSiteAddon[];
    readonly name: string;
    readonly primaryDomain: string;
  }[]>;
}
