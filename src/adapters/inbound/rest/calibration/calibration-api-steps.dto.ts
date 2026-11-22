import { calibrationApiPath } from '../../../../domain/calibration/calibration-api.policy.js';
import type { ICalibrationResolvedTarget } from '../../../../domain/calibration/calibration-run.js';
import { HttpFailure } from '../shared/admin-http.boundary.js';

export function resolvedApiSteps(value: unknown): NonNullable<ICalibrationResolvedTarget['apiSteps']> {
  if (!Array.isArray(value) || value.length > 8) {
    throw new HttpFailure(400, 'Invalid calibration API steps');
  }

  return value.map((step: unknown) => {
    if (
      !step
      || typeof step !== 'object'
      || !('addonKey' in step)
      || !('queryId' in step)
      || !('path' in step)
      || Object.keys(step).some(key => !['addonKey', 'queryId', 'path'].includes(key))
      || typeof step.addonKey !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(step.addonKey)
      || typeof step.queryId !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(step.queryId)
      || typeof step.path !== 'string'
    ) {
      throw new HttpFailure(400, 'Invalid public API query');
    }

    return { addonKey: step.addonKey, queryId: step.queryId, path: calibrationApiPath(step.path) };
  });
}
