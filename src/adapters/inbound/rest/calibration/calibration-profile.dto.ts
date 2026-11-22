import { CalibrationPageReferenceKind, CalibrationScope, type ICalibrationProfileDraft } from
  '../../../../domain/calibration/calibration-profile.js';
import { HttpFailure } from '../shared/admin-http.boundary.js';

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))
  ) {
    throw new HttpFailure(400, 'Invalid calibration object');
  }

  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpFailure(400, 'Expected calibration text');
  }

  return value;
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpFailure(400, 'Expected calibration number');
  }

  return value;
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new HttpFailure(400, 'Expected calibration numbers');
  }

  return value.map(number);
}

export function apiStepsDto(value: unknown): { addonKey: string; queryId: string }[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new HttpFailure(400, 'At most eight public API steps per scenario');
  }

  return value.map(step => {
    const row = object(step, ['addonKey', 'queryId']);

    return { addonKey: string(row.addonKey), queryId: string(row.queryId) };
  });
}

function nullableNumber(value: unknown): number | null {
  return value === null ? null : number(value);
}

export function calibrationDraftDto(value: unknown): ICalibrationProfileDraft {
  const body = object(value, ['name', 'scope', 'siteId', 'distributedCpu', 'targets', 'criteria', 'search']);
  const criteria = object(body.criteria, ['averageMs', 'medianMs', 'p95Ms', 'p99Ms']);
  const search = object(body.search, ['concurrencyLevels', 'processCounts', 'poolSizes',
    'databaseCpuStep', 'warmupSeconds',
    'probeSeconds', 'confirmationSeconds', 'maximumSeconds']);
  const scope = body.scope === CalibrationScope.Site ? CalibrationScope.Site
    : body.scope === CalibrationScope.Installation ? CalibrationScope.Installation : null;

  if (!scope || !Array.isArray(body.targets)) {
    throw new HttpFailure(400, 'Invalid calibration scope or pages');
  }

  return {
    name: string(body.name),
    scope,
    siteId: body.siteId === null ? null : string(body.siteId),
    distributedCpu: number(body.distributedCpu),
    targets: body.targets.map(value => {
      const target = object(value, ['siteId', 'kind', 'reference', 'share', 'apiSteps']);
      const kind = Object.values(CalibrationPageReferenceKind).find(item => item === target.kind);

      if (!kind) {
        throw new HttpFailure(400, 'Invalid calibration page kind');
      }

      return {
        siteId: string(target.siteId),
        kind,
        reference: string(target.reference),
        ...(target.apiSteps === undefined ? {} : { apiSteps: apiStepsDto(target.apiSteps) }),
        share: target.share === undefined || target.share === null ? 0 : number(target.share),
      };
    }),
    criteria: {
      averageMs: nullableNumber(criteria.averageMs),
      medianMs: nullableNumber(criteria.medianMs),
      p95Ms: nullableNumber(criteria.p95Ms),
      p99Ms: nullableNumber(criteria.p99Ms),
    },
    search: {
      concurrencyLevels: numbers(search.concurrencyLevels),
      processCounts: numbers(search.processCounts),
      poolSizes: numbers(search.poolSizes),
      databaseCpuStep: number(search.databaseCpuStep),
      warmupSeconds: number(search.warmupSeconds),
      probeSeconds: number(search.probeSeconds),
      confirmationSeconds: number(search.confirmationSeconds),
      maximumSeconds: number(search.maximumSeconds),
    },
  };
}
