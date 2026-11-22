import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import {
  CalibrationPageReferenceKind, CalibrationScope, type ICalibrationProfileDraft,
  type ICalibrationTrafficTarget,
} from './calibration-profile.js';

function valid(condition: boolean, message: string): void {
  if (!condition) {
    throw new BusinessError(BusinessErrorCode.Validation, message);
  }
}

function positiveIntegers(values: readonly number[], label: string): number[] {
  valid(Array.isArray(values) && values.length > 0, 'Expected calibration ' + label);
  valid(values.every(value => Number.isSafeInteger(value) && value > 0), 'Invalid calibration ' + label);

  return [...new Set(values)].sort((a, b) => a - b);
}

export function normalizeCalibrationDraft(input: ICalibrationProfileDraft):
Omit<ICalibrationProfileDraft, 'targets'> & { readonly targets: readonly ICalibrationTrafficTarget[] } {
  valid(typeof input.name === 'string' && input.name.trim().length > 0
    && input.name.trim().length <= 128, 'Expected calibration profile name');
  valid(Object.values(CalibrationScope).includes(input.scope), 'Invalid calibration scope');
  valid(input.scope === CalibrationScope.Site
    ? typeof input.siteId === 'string' && input.siteId.length > 0 && input.siteId.length <= 128
    : input.siteId === null, 'Invalid calibration site scope');
  valid(Number.isFinite(input.distributedCpu) && input.distributedCpu > 0
    && Math.abs(input.distributedCpu * 10 - Math.round(input.distributedCpu * 10)) < 1e-9,
  'Expected a positive CPU budget with at most one decimal place');
  valid(Array.isArray(input.targets) && input.targets.length > 0, 'Expected calibration pages');
  const targets = input.targets.map(target => {
    valid(typeof target.siteId === 'string' && target.siteId.length > 0 && target.siteId.length <= 128,
      'Invalid calibration page site');
    valid(input.scope !== CalibrationScope.Site || target.siteId === input.siteId,
      'A site profile cannot include another site');
    valid(Object.values(CalibrationPageReferenceKind).includes(target.kind), 'Invalid calibration page reference');
    valid(typeof target.reference === 'string' && target.reference.length > 0
      && target.reference.length <= 4096, 'Expected calibration page reference');
    const share = target.share ?? 0;

    valid(Number.isSafeInteger(share) && share >= 0 && share <= 10000,
      'Traffic percentages require hundredths between zero and one hundred');

    if (target.kind === CalibrationPageReferenceKind.PageNumber) {
      valid(/^[1-9][0-9]*$/.test(target.reference), 'Expected numeric page identity');
    } else if (target.kind === CalibrationPageReferenceKind.RelativeUrl) {
      valid(target.reference.startsWith('/') && !target.reference.startsWith('//')
        && !target.reference.includes('\\'), 'Expected relative page URL');
    } else {
      let url: URL;

      try {
        url = new URL(target.reference);
      } catch {
        throw new BusinessError(BusinessErrorCode.Validation, 'Expected absolute page URL');
      }
      valid(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
        'Expected a public HTTP page URL without credentials');
    }

    const apiSteps = target.apiSteps;

    valid(apiSteps === undefined || Array.isArray(apiSteps) && apiSteps.length <= 8,
      'At most eight public API steps per scenario');

    for (const step of apiSteps ?? []) {
      valid(/^[a-z][a-z0-9-]{0,63}$/.test(step.addonKey) && /^[a-z][a-z0-9-]{0,63}$/.test(step.queryId),
        'Invalid calibration add-on query');
    }

    return {
      siteId: target.siteId,
      kind: target.kind,
      reference: target.reference,
      share,
      ...(apiSteps === undefined ? {} : { apiSteps: apiSteps.map(step => ({ ...step })) }),
    };
  });

  valid(targets.reduce((sum, target) => sum + target.share, 0) <= 10000,
    'Calibration traffic percentages exceed one hundred');

  for (const value of [input.criteria.averageMs, input.criteria.medianMs, input.criteria.p95Ms, input.criteria.p99Ms]) {
    valid(value === null || Number.isFinite(value) && value > 0, 'Invalid calibration latency threshold');
  }
  const concurrencyLevels = positiveIntegers(input.search.concurrencyLevels, 'load concurrency');
  const processCounts = positiveIntegers(input.search.processCounts, 'process counts');
  const poolSizes = positiveIntegers(input.search.poolSizes, 'pool sizes');
  const step = input.search.databaseCpuStep;

  valid(Number.isFinite(step) && step > 0 && Math.abs(step * 10 - Math.round(step * 10)) < 1e-9,
    'Invalid calibration database CPU step');

  for (const value of [input.search.warmupSeconds, input.search.probeSeconds,
    input.search.confirmationSeconds, input.search.maximumSeconds]) {
    valid(Number.isSafeInteger(value) && value > 0, 'Invalid calibration duration');
  }
  valid(input.search.maximumSeconds >= input.search.warmupSeconds + input.search.confirmationSeconds,
    'Calibration time budget cannot fit a confirmed measurement');

  return {
    name: input.name.trim(),
    scope: input.scope,
    siteId: input.siteId,
    distributedCpu: input.distributedCpu,
    targets,
    criteria: { ...input.criteria },
    search: { ...input.search, concurrencyLevels, processCounts, poolSizes },
  };
}
