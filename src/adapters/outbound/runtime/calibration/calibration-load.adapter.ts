import { type ChildProcess, fork } from 'node:child_process';

import type { ICalibrationLoadPort } from '../../../../ports/outbound/calibration/calibration-runtime.port.js';

type CalibrationWorkerParameters = Parameters<ICalibrationLoadPort['measure']>[0];

export interface ICalibrationWorkerInput extends CalibrationWorkerParameters {
  readonly origin: string;
}

export class ProcessCalibrationLoad implements ICalibrationLoadPort {
  readonly sharesCmsBudget = true;
  readonly placement = 'Independent child process; shares the current host/container CPU budget';

  constructor(private readonly origin: () => string, private readonly runner = new URL(import.meta.url.endsWith('.ts')
    ? '../../../../../dist/adapters/outbound/runtime/calibration/calibration-load.worker.js'
    : './calibration-load.worker.js', import.meta.url)) {}

  async measure(input: Parameters<ICalibrationLoadPort['measure']>[0], signal: AbortSignal):
  ReturnType<ICalibrationLoadPort['measure']> {
    signal.throwIfAborted();
    const origin = this.origin();
    const child = fork(this.runner, [], {
      serialization: 'advanced',
      env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    return this.exchange(child, { ...input, origin }, signal);
  }

  private exchange(child: ChildProcess, input: ICalibrationWorkerInput, signal: AbortSignal):
  ReturnType<ICalibrationLoadPort['measure']> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let result: Awaited<ReturnType<ICalibrationLoadPort['measure']>> | undefined;
      let failure: unknown;
      const timeout = setTimeout(() => stop(new Error('Calibration generator timed out')),
        (input.seconds + input.warmupSeconds + 15) * 1000);
      const stop = (error: unknown): void => {
        failure = error;
        child.kill();
      };
      const abort = (): void => stop(signal.reason ?? new Error('Calibration cancelled'));

      signal.addEventListener('abort', abort, { once: true });
      child.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object' || !('metrics' in message) || !('siteMetrics' in message)) {
          stop(new Error('Invalid calibration worker response'));

          return;
        }
        // The worker is our pinned executable; serialization preserves the explicit metrics shape.
        if (validLoadResult(message)) {
          result = message;
        } else {
          stop(new Error('Invalid calibration metrics'));
        }
      });
      child.once('error', error => {
        failure = error;
      });
      child.once('close', code => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);

        if (failure || code !== 0 || !result) {
          reject(failure ?? new Error('Calibration generator exited without a result'));
        } else {
          resolve(result);
        }
      });
      child.send(input, error => {
        if (error) {
          stop(error);
        }
      });

      if (signal.aborted) {
        abort();
      }
    });
  }
}

export function validLoadResult(value: unknown): value is Awaited<ReturnType<ICalibrationLoadPort['measure']>> {
  if (
    !value
    || typeof value !== 'object'
    || !('metrics' in value)
    || !('siteMetrics' in value)
    || !value.siteMetrics
    || typeof value.siteMetrics !== 'object'
  ) {
    return false;
  }

  const valid = (metrics: unknown): boolean => metrics !== null && typeof metrics === 'object'
    && ['averageMs', 'medianMs', 'p95Ms', 'p99Ms', 'requests', 'errors', 'dropped', 'successfulRps']
      .every(key => key in metrics && typeof Reflect.get(metrics, key) === 'number'
        && Number.isFinite(Reflect.get(metrics, key)) && Reflect.get(metrics, key) >= 0);

  return valid(value.metrics) && Object.values(value.siteMetrics).every(valid)
    && (!('stepMetrics' in value) || value.stepMetrics !== null && typeof value.stepMetrics === 'object'
      && Object.values(value.stepMetrics).every(valid));
}
