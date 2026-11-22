import { expect, it } from 'vitest';

import { CalibrationScope } from '../../src/domain/calibration/calibration-profile.js';
import type { ICalibrationConfiguration, ICalibrationMetrics } from '../../src/domain/calibration/calibration-run.js';
import { calibrationNeighbours, calibrationPasses } from '../../src/domain/calibration/calibration-search.policy.js';
import { calibrationProfile } from '../support/calibration.js';

const configuration: ICalibrationConfiguration = {
  databaseCpu: 1,
  cmsCpu: 3,
  sitePoolSize: 5,
  sites: [{ siteId: 'one', processes: 1 }, { siteId: 'two', processes: 3 }],
};

const metrics: ICalibrationMetrics = {
  averageMs: 20,
  medianMs: 10,
  p95Ms: 50,
  p99Ms: 700,
  requests: 1000,
  errors: 0,
  dropped: 0,
  successfulRps: 100,
};

it('keeps shared resources and other sites fixed for site profiles, including one and two CPU scenarios', () => {
  for (const distributedCpu of [1, 2, 4]) {
    const candidates = calibrationNeighbours({ ...calibrationProfile(), distributedCpu }, configuration);

    expect(candidates.some(candidate => candidate.sites[0]?.processes === 2)).toBe(true);
    expect(candidates.every(candidate => candidate.databaseCpu === 1 && candidate.sitePoolSize === 5
      && candidate.cmsCpu === 3 && candidate.sites[1]?.processes === 3)).toBe(true);
  }
});

it('distributes only the declared Docker budget, including fractional database quotas', () => {
  const candidates = calibrationNeighbours({
    ...calibrationProfile(),
    scope: CalibrationScope.Installation,
    siteId: null,
  }, configuration);

  expect(candidates.some(candidate => candidate.databaseCpu === 1.2 && candidate.cmsCpu === 2.8)).toBe(true);
  expect(candidates.every(candidate => candidate.databaseCpu + candidate.cmsCpu === 4)).toBe(true);
});

it('interleaves CPU, pool and both site searches so a bounded run cannot spend all its time on the first site', () => {
  const profile = { ...calibrationProfile(), scope: CalibrationScope.Installation, siteId: null };
  const first = calibrationNeighbours(profile, configuration).slice(0, 4);

  expect(first.some(candidate => candidate.sitePoolSize !== configuration.sitePoolSize)).toBe(true);
  expect(first.some(candidate => candidate.databaseCpu !== configuration.databaseCpu)).toBe(true);
});

it('requires every enabled latency criterion and rejects errors, zero traffic and generator drops', () => {
  const criteria = calibrationProfile().criteria;

  expect(calibrationPasses(metrics, criteria)).toBe(true);
  expect(calibrationPasses(metrics, { ...criteria, p99Ms: 600 })).toBe(false);
  expect(calibrationPasses({ ...metrics, errors: 1 }, criteria)).toBe(false);
  expect(calibrationPasses({ ...metrics, dropped: 1 }, criteria)).toBe(false);
  expect(calibrationPasses({ ...metrics, requests: 0 }, criteria)).toBe(false);
});
