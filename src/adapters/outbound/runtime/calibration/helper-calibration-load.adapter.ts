import { request } from 'node:http';

import type { ICalibrationLoadPort } from '../../../../ports/outbound/calibration/calibration-runtime.port.js';
import { validLoadResult } from './calibration-load.adapter.js';

export class HelperCalibrationLoad implements ICalibrationLoadPort {
  readonly sharesCmsBudget = false;
  readonly placement = 'External resource helper; outside the CMS container quota, competing for host CPU';

  constructor(private readonly socketPath: string, private readonly secret: string) {}

  async measure(input: Parameters<ICalibrationLoadPort['measure']>[0], signal: AbortSignal):
  ReturnType<ICalibrationLoadPort['measure']> {
    signal.throwIfAborted();

    return new Promise((resolve, reject) => {
      const outgoing = request({
        socketPath: this.socketPath,
        path: '/calibration/load',
        method: 'POST',
        signal,
        headers: { Authorization: 'Bearer ' + this.secret, 'Content-Type': 'application/json' },
      }, response => {
        const chunks: Buffer[] = [];
        let size = 0;

        response.on('data', (chunk: Buffer) => {
          size += chunk.length;

          if (size > 1048576) {
            outgoing.destroy(new Error('Calibration helper response exceeds its limit'));
          } else {
            chunks.push(chunk);
          }
        });
        response.on('error', reject);
        response.on('aborted', () => reject(new Error('Calibration helper disconnected')));
        response.on('end', () => {
          try {
            const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));

            if (response.statusCode !== 200 || !validLoadResult(result)) {
              throw new Error('Calibration helper failed to measure traffic');
            }
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
      const timeout = setTimeout(() => outgoing.destroy(new Error('Calibration helper timed out')),
        (input.warmupSeconds + input.seconds + 20) * 1000);

      outgoing.once('close', () => clearTimeout(timeout));
      outgoing.once('error', reject);
      outgoing.end(JSON.stringify(input));
    });
  }
}
