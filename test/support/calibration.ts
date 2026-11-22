import {
  CalibrationPageReferenceKind, CalibrationScope, type ICalibrationProfile,
  type ICalibrationProfileDraft,
} from '../../src/domain/calibration/calibration-profile.js';

export function calibrationDraft(): ICalibrationProfileDraft {
  return {
    name: 'Home traffic',
    scope: CalibrationScope.Site,
    siteId: 'one',
    distributedCpu: 4,
    targets: [{ siteId: 'one', kind: CalibrationPageReferenceKind.RelativeUrl, reference: '/', share: 10000 }],
    criteria: { averageMs: null, medianMs: null, p95Ms: 600, p99Ms: null },
    search: {
      concurrencyLevels: [1, 4, 16, 64],
      processCounts: [1, 2, 4],
      poolSizes: [1, 5, 10],
      databaseCpuStep: 0.1,
      warmupSeconds: 5,
      probeSeconds: 15,
      confirmationSeconds: 60,
      maximumSeconds: 900,
    },
  };
}

export function calibrationProfile(): ICalibrationProfile {
  const draft = calibrationDraft();

  return {
    ...draft,
    targets: draft.targets.map(target => ({ ...target, share: target.share ?? 0 })),
    profileId: 'profile',
    version: 'v1',
    createdAt: new Date('2026-11-15T12:00:00Z'),
    updatedAt: new Date('2026-11-15T12:00:00Z'),
    deletedAt: null,
  };
}
