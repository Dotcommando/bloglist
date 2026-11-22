import { Agent, request } from 'node:http';
import { createHistogram, performance } from 'node:perf_hooks';

import { calibrationApiPath } from '../../../../domain/calibration/calibration-api.policy.js';
import type { ICalibrationMetrics } from '../../../../domain/calibration/calibration-run.js';
import type { ICalibrationWorkerInput } from './calibration-load.adapter.js';

process.once('disconnect', () => process.exit(1));

process.once('message', (input: ICalibrationWorkerInput) => {
  const run = async (): Promise<void> => {
    const origin = new URL(input.origin);

    if (
      origin.protocol !== 'http:'
      || !['127.0.0.1', '::1', '[::1]'].includes(origin.hostname)
      || !Number.isSafeInteger(input.concurrency)
      || input.concurrency < 1
      || !Number.isFinite(input.seconds)
      || input.seconds <= 0
      || !Number.isFinite(input.warmupSeconds)
      || input.warmupSeconds < 0
    ) {
      throw new Error('Invalid trusted generator configuration');
    }

    const targets = input.targets.filter(target => target.share > 0);

    for (const target of targets) {
      if ((target.apiSteps?.length ?? 0) > 8) {
        throw new Error('Too many API steps');
      }

      for (const step of target.apiSteps ?? []) {
        calibrationApiPath(step.path);
      }
    }
    const weight = targets.reduce((sum, target) => sum + target.share, 0);

    if (
      !weight
      || targets.some(target => !target.path.startsWith('/') || target.path.startsWith('//')
      || /[\r\n\\]/.test(target.path + target.authority))
    ) {
      throw new Error('Invalid generator traffic');
    }

    const agent = new Agent({ keepAlive: true, maxSockets: input.concurrency, maxFreeSockets: input.concurrency });
    const make = (): { histogram: ReturnType<typeof createHistogram>; requests: number; errors: number } =>
      ({ histogram: createHistogram(), requests: 0, errors: 0 });
    const aggregate = make();
    const sites = new Map(targets.map(target => [target.siteId, make()]));
    const steps = new Map(targets.flatMap(target => [target.path, ...(target.apiSteps ?? []).map(step => step.path)]
      .map(path => [JSON.stringify([target.siteId, path]), make()] as const)));
    let index = 0;
    const start = performance.now();
    const measuring = start + input.warmupSeconds * 1000;
    const end = measuring + input.seconds * 1000;
    const hardStop = setTimeout(() => {
      agent.destroy();
    },
    (input.warmupSeconds + input.seconds + 10) * 1000);
    const select = (): typeof targets[number] => {
      // A low discrepancy sequence avoids repeating one page per connection at integer-weight boundaries.
      const chosen = ((index++ * 0.6180339887498949) % 1) * weight;
      let cumulative = 0;

      return targets.find(target => (cumulative += target.share) > chosen) ?? targets.at(-1)!;
    };
    const worker = async (): Promise<void> => {
      while (performance.now() < end) {
        const target = select();
        const began = performance.now();
        const record = began >= measuring;
        let success = true;

        for (const path of [target.path, ...(target.apiSteps ?? []).map(step => step.path)]) {
          const stepBegan = performance.now();
          const ok = await new Promise<boolean>(resolve => {
            let done = false;
            const finish = (value: boolean): void => {
              if (!done) {
                done = true;
                resolve(value);
              }
            };
            const outgoing = request(origin, {
              path,
              headers: {
                Host: target.authority,
                'User-Agent': 'Zarya-Calibration',
                Accept: path.startsWith('/api/') ? 'application/json' : 'text/html',
              },
              agent,
            }, response => {
              response.on('error', () => finish(false));
              response.on('aborted', () => finish(false));
              response.on('end', () => finish(response.statusCode === 200));
              response.resume();
            });

            outgoing.on('error', () => finish(false));
            outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Calibration request timed out')));
            outgoing.end();
          });

          success = success && ok;

          if (record) {
            const metric = steps.get(JSON.stringify([target.siteId, path]))!;

            metric.requests++;
            metric.errors += ok ? 0 : 1;
            metric.histogram.record(Math.max(1, Math.round((performance.now() - stepBegan) * 1e6)));
          }
          if (!ok) {
            break;
          }
        }

        if (record) {
          const elapsed = Math.max(1, Math.round((performance.now() - began) * 1e6));

          for (const metrics of [aggregate, sites.get(target.siteId)!]) {
            metrics.requests++;
            metrics.errors += success ? 0 : 1;
            metrics.histogram.record(elapsed);
          }
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: input.concurrency }, worker));
      const seconds = Math.max(input.seconds, (performance.now() - measuring) / 1000);
      const metrics = (value: ReturnType<typeof make>): ICalibrationMetrics => ({
        averageMs: value.requests ? value.histogram.mean / 1e6 : 0,
        medianMs: value.requests ? value.histogram.percentile(50) / 1e6 : 0,
        p95Ms: value.requests ? value.histogram.percentile(95) / 1e6 : 0,
        p99Ms: value.requests ? value.histogram.percentile(99) / 1e6 : 0,
        requests: value.requests,
        errors: value.errors,
        dropped: 0,
        successfulRps: (value.requests - value.errors) / seconds,
      });

      process.send!({
        metrics: metrics(aggregate),
        stepMetrics: Object.fromEntries([...steps].map(([key, value]) => [key, metrics(value)])),
        siteMetrics: Object.fromEntries(
          [...sites].map(([siteId, value]) => [siteId, metrics(value)])),
      }, (error: Error | null) => process.exit(error ? 1 : 0));
    } finally {
      clearTimeout(hardStop);
      agent.destroy();
    }
  };

  void run().catch(() => process.exit(1));
});
