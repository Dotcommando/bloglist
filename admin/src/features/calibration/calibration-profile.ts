import { CalibrationReferenceKind, CalibrationScope, type ICalibrationDraft } from './calibration.types.js';

export function calibrationDefault(siteIds: readonly string[] | string, cpu: number): ICalibrationDraft {
  const ids = typeof siteIds === 'string' ? [siteIds] : [...new Set(siteIds)];
  const share = Math.floor(10000 / ids.length);

  return {
    name: '',
    scope: CalibrationScope.Installation,
    siteId: null,
    distributedCpu: cpu >= 3 ? Math.max(2, Math.floor(cpu * 10) / 10 - 2)
      : Math.max(0.1, Math.floor(cpu * 10) / 10),
    targets: ids.map((siteId, index) => ({
      siteId,
      kind: CalibrationReferenceKind.RelativeUrl,
      reference: '/',
      share: share + (index < 10000 % ids.length ? 1 : 0),
    })),
    criteria: { averageMs: null, medianMs: null, p95Ms: 600, p99Ms: null },
    search: {
      concurrencyLevels: [1, 4, 16, 64],
      processCounts: [1, 2, 3, 4],
      poolSizes: [1, 5, 10],
      databaseCpuStep: 0.5,
      warmupSeconds: 5,
      probeSeconds: 10,
      confirmationSeconds: 60,
      maximumSeconds: 900,
    },
  };
}

export function calibrationShare(value: string): number | null {
  const text = value.trim().replace(',', '.');

  if (!text) {
    return 0;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, fraction = ''] = text.split('.');
  const share = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(share) && share <= 10000 ? share : null;
}

export function calibrationShareStep(value: string, direction: 1 | -1): string {
  return String(Math.min(10000, Math.max(0, (calibrationShare(value) ?? 0) + direction * 100)) / 100);
}

export function calibrationReference(value: string): CalibrationReferenceKind {
  return /^[1-9][0-9]*$/.test(value.trim()) ? CalibrationReferenceKind.PageNumber
    : /^https?:\/\//i.test(value.trim()) ? CalibrationReferenceKind.AbsoluteUrl : CalibrationReferenceKind.RelativeUrl;
}

export function calibrationPercentTotal(values: readonly string[]): { total: number; valid: boolean } {
  const shares = values.map(calibrationShare);
  const total = shares.reduce<number>((sum, share) => sum + (share ?? 0), 0);

  return { total, valid: shares.every(share => share !== null) && total <= 10000 };
}
