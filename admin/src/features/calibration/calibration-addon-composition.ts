import type { ICalibrationAddonSnapshot } from './calibration-addon.types.js';

export function calibrationCompositionMatches(measured: readonly ICalibrationAddonSnapshot[] | undefined,
  current: readonly ICalibrationAddonSnapshot[]): boolean {
  const key = (snapshots: readonly ICalibrationAddonSnapshot[]): string => JSON.stringify(snapshots.map(site => [
    site.siteId,
    site.addons.map(addon => [addon.addonKey, addon.implementationVersion, addon.runtimeDigest,
      addon.configurationHash]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

  return measured !== undefined && key(measured) === key(current);
}
