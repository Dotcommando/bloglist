import { expect, it } from 'vitest';

import { calibrationDefault, calibrationPercentTotal, calibrationShare, calibrationShareStep } from
  '../../admin/src/features/calibration/calibration-profile.js';

it('defaults to the home page only and p95 600 ms', () => {
  const profile = calibrationDefault('one', 2);

  expect(profile.targets).toEqual([{ siteId: 'one', kind: 'RelativeUrl', reference: '/', share: 10000 }]);
  expect(calibrationDefault('one', 6).distributedCpu).toBe(4);
  expect(calibrationDefault('one', 3).distributedCpu).toBe(2);
  expect(calibrationDefault('one', 1).distributedCpu).toBe(1);
  expect(calibrationDefault('one', 2).distributedCpu).toBe(2);
  expect(profile.criteria).toEqual({ averageMs: null, medianMs: null, p95Ms: 600, p99Ms: null });
});

it('defaults to every installation site with a complete shared traffic mix', () => {
  const profile = calibrationDefault(['one', 'two'], 6);

  expect(profile.scope).toBe('Installation');
  expect(profile.siteId).toBeNull();
  expect(profile.targets).toEqual([
    { siteId: 'one', kind: 'RelativeUrl', reference: '/', share: 5000 },
    { siteId: 'two', kind: 'RelativeUrl', reference: '/', share: 5000 },
  ]);
});

it('counts exact hundredths, treats blanks as zero and clears over-allocation when corrected', () => {
  expect(calibrationPercentTotal(['99.99', '0.01', ''])).toEqual({ total: 10000, valid: true });
  expect(calibrationPercentTotal(['100', '0.01'])).toEqual({ total: 10001, valid: false });
  expect(calibrationPercentTotal(['99.98', '0.01'])).toEqual({ total: 9999, valid: true });
  expect(calibrationShare('1,25')).toBe(125);
  expect(calibrationShare('1.001')).toBeNull();
  expect(calibrationShare('1e2')).toBeNull();
});

it('increments by one whole percentage point while preserving typed hundredths', () => {
  expect(calibrationShareStep('1.25', 1)).toBe('2.25');
  expect(calibrationShareStep('2.25', -1)).toBe('1.25');
  expect(calibrationShareStep('', 1)).toBe('1');
});
