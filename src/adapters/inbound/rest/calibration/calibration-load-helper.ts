import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ICalibrationResolvedTarget } from '../../../../domain/calibration/calibration-run.js';
import type { ICalibrationLoadPort } from '../../../../ports/outbound/calibration/calibration-runtime.port.js';
import { HttpFailure, readAdminBody, sendJson } from '../shared/admin-http.boundary.js';
import { resolvedApiSteps } from './calibration-api-steps.dto.js';

/** Called after private-key authentication; the destination is deployment configuration. */
export async function handleCalibrationLoad(request: IncomingMessage, response: ServerResponse,
  load: ICalibrationLoadPort): Promise<void> {
  if (request.method !== 'POST') {
    throw new HttpFailure(405, 'POST required');
  }

  const body = await readAdminBody(request, 65536);

  if (
    Object.keys(body).some(key => !['targets', 'concurrency', 'warmupSeconds', 'seconds'].includes(key))
    || typeof body.concurrency !== 'number'
    || !Number.isSafeInteger(body.concurrency)
    || body.concurrency < 1
    || typeof body.warmupSeconds !== 'number'
    || !Number.isSafeInteger(body.warmupSeconds)
    || body.warmupSeconds < 0
    || typeof body.seconds !== 'number'
    || !Number.isSafeInteger(body.seconds)
    || body.seconds < 1
    || !Array.isArray(body.targets)
  ) {
    throw new HttpFailure(400, 'Invalid calibration load');
  }

  const targets: ICalibrationResolvedTarget[] = body.targets.map((target: unknown) => {
    if (
      !target
      || typeof target !== 'object'
      || Object.keys(target).some(key => !['siteId', 'authority', 'path', 'share',
        'effectiveShare', 'releaseId', 'apiSteps'].includes(key))
      || !('siteId' in target)
      || typeof target.siteId !== 'string'
      || !('authority' in target)
      || typeof target.authority !== 'string'
      || !('path' in target)
      || typeof target.path !== 'string'
      || !('share' in target)
      || typeof target.share !== 'number'
      || !Number.isSafeInteger(target.share)
      || target.share < 0
      || target.share > 10000
      || !('effectiveShare' in target)
      || typeof target.effectiveShare !== 'number'
      || !('releaseId' in target)
      || typeof target.releaseId !== 'string'
    ) {
      throw new HttpFailure(400, 'Invalid calibration target');
    }

    return {
      siteId: target.siteId,
      authority: target.authority,
      path: target.path,
      share: target.share,
      effectiveShare: target.effectiveShare,
      releaseId: target.releaseId,
      ...('apiSteps' in target ? { apiSteps: resolvedApiSteps(target.apiSteps) } : {}),
    };
  });
  const abort = new AbortController();
  const disconnected = (): void => {
    if (!response.writableEnded) {
      abort.abort();
    }
  };

  response.once('close', disconnected);

  try {
    sendJson(response, 200, await load.measure({
      targets,
      concurrency: body.concurrency,
      warmupSeconds: body.warmupSeconds,
      seconds: body.seconds,
    }, abort.signal));
  } finally {
    response.off('close', disconnected);
  }
}
