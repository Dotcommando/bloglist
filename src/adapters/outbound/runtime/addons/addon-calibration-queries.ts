import type { ICalibrationAddonQuery } from '../../../../domain/calibration/calibration-addon.js';
import { calibrationApiPath } from '../../../../domain/calibration/calibration-api.policy.js';

export function readCalibrationQueries(value: unknown): readonly ICalibrationAddonQuery[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error('Invalid calibration query declarations');
  }

  const ids = new Set<string>();

  return value.map((query: unknown) => {
    if (
      !query
      || typeof query !== 'object'
      || !('queryId' in query)
      || !('path' in query)
      || Object.keys(query).some(key => !['queryId', 'path'].includes(key))
      || typeof query.queryId !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(query.queryId)
      || ids.has(query.queryId)
      || typeof query.path !== 'string'
      || /[{}]/.test(query.path.replaceAll('{siteId}', '').replaceAll('{pageId}', '')
        .replaceAll('{now}', '').replaceAll('{in30Days}', ''))
    ) {
      throw new Error('Invalid public read-only calibration query');
    }
    calibrationApiPath(query.path.replaceAll('{siteId}', 'site').replaceAll('{pageId}', 'page')
      .replaceAll('{now}', 'now').replaceAll('{in30Days}', 'later'));
    ids.add(query.queryId);

    return { queryId: query.queryId, path: query.path };
  });
}
