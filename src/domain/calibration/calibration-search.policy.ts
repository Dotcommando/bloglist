import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { CalibrationScope, type ICalibrationLatencyCriteria, type ICalibrationProfile } from './calibration-profile.js';
import type { ICalibrationConfiguration, ICalibrationMetrics } from './calibration-run.js';

export function calibrationPasses(metrics: ICalibrationMetrics, criteria: ICalibrationLatencyCriteria): boolean {
  return metrics.requests > 0 && metrics.successfulRps > 0 && metrics.errors === 0 && metrics.dropped === 0
    && [metrics.averageMs, metrics.medianMs, metrics.p95Ms, metrics.p99Ms, metrics.successfulRps]
      .every(value => Number.isFinite(value) && value >= 0)
    && (criteria.averageMs === null || metrics.averageMs <= criteria.averageMs)
    && (criteria.medianMs === null || metrics.medianMs <= criteria.medianMs)
    && (criteria.p95Ms === null || metrics.p95Ms <= criteria.p95Ms)
    && (criteria.p99Ms === null || metrics.p99Ms <= criteria.p99Ms);
}

export function calibrationNeighbours(profile: ICalibrationProfile, configuration: ICalibrationConfiguration):
ICalibrationConfiguration[] {
  const groups: ICalibrationConfiguration[][] = [];

  for (const site of configuration.sites) {
    if (profile.scope === CalibrationScope.Site && site.siteId !== profile.siteId) {
      continue;
    }

    const candidates: ICalibrationConfiguration[] = [];

    groups.push(candidates);

    for (const processes of profile.search.processCounts) {
      candidates.push({
        ...configuration,
        sites: configuration.sites.map(entry => entry.siteId === site.siteId
          ? { ...entry, processes } : entry),
      });
    }
  }

  if (profile.scope === CalibrationScope.Installation) {
    const pools: ICalibrationConfiguration[] = [];
    const candidates: ICalibrationConfiguration[] = [];

    groups.push(pools, candidates);

    for (const sitePoolSize of profile.search.poolSizes) {
      pools.push({ ...configuration, sitePoolSize });
    }
    const budget = Math.round(profile.distributedCpu * 10);
    const step = Math.round(profile.search.databaseCpuStep * 10);

    if (step < 1 || budget < 2) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Full calibration requires at least 0.2 CPU');
    }

    for (let cpu = step; cpu < budget; cpu += step) {
      candidates.push({ ...configuration, databaseCpu: cpu / 10, cmsCpu: (budget - cpu) / 10 });
    }
  }

  return Array.from({ length: Math.max(0, ...groups.map(group => group.length)) }, (_, index) =>
    groups.flatMap(group => group[index] ? [group[index]!] : [])).flat();
}
