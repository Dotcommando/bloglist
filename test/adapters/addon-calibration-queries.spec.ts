import { expect, it } from 'vitest';

import { readCalibrationQueries }
  from '../../src/adapters/outbound/runtime/addons/addon-calibration-queries.js';
import { calibrationApiPath } from '../../src/domain/calibration/calibration-api.policy.js';

it('accepts declared public GET paths with trusted site, page and UTC-window placeholders', () => {
  const queries = [{ queryId: 'list', path: '/api/fixture?pageId={pageId}&from={now}&to={in30Days}' }];

  expect(readCalibrationQueries(queries)).toEqual(queries);
  expect(readCalibrationQueries([])).toEqual([]);
});

it.each([
  '//outside.test/api/list', '/api/../admin', '/api/%61dmin/resources', '/api/admin/resources',
  '/api/health', '/api/list%0d%0aHost:outside.test', '/api/list#private', '/api/..%2fadmin',
])('rejects foreign, administrative and malformed calibration query %s', path => {
  expect(() => calibrationApiPath(path)).toThrow();
});

it('rejects duplicate identities, unknown placeholders, write declarations and unbounded query lists', () => {
  expect(() => readCalibrationQueries([{ queryId: 'x', path: '/api/x', method: 'POST' }])).toThrow();
  expect(() => readCalibrationQueries([{ queryId: 'x', path: '/api/x?token={secret}' }])).toThrow();
  expect(() => readCalibrationQueries(Array.from({ length: 33 }, (_, i) => ({
    queryId: 'q' + i, path: '/api/x',
  })))).toThrow();
  expect(() => readCalibrationQueries([{ queryId: 'x', path: '/api/x' }, { queryId: 'x', path: '/api/y' }])).toThrow();
});
