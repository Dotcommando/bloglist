import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import type { InstallationResourceRuntime } from
  '../../src/adapters/outbound/runtime/processes/installation-resource-runtime.js';
import type { IServingProcess, SiteProcessPool } from
  '../../src/adapters/outbound/runtime/processes/site-process-pool.js';

interface ILoadSample {
  readonly site: string;
  readonly at: number;
  readonly durationMs: number;
  readonly status: number;
}

interface IWorkerDiagnostic { readonly requests: number; readonly renders: number; readonly cpuUs: number; }

interface ILoadHarness {
  readonly pool: SiteProcessPool;
  readonly resources: InstallationResourceRuntime;
  readonly siteIds: readonly string[];
  readonly read: (host: string) => Promise<{ readonly status: number }>;
  readonly onFreeze: () => Promise<void>;
}

function diagnostic(worker: IServingProcess): Promise<IWorkerDiagnostic> {
  return new Promise((resolve, reject) => {
    const finish = (error: Error | null, value?: IWorkerDiagnostic): void => {
      clearTimeout(timer);
      worker.child.off('message', message);
      worker.child.off('exit', exit);

      if (error || !value) {
        reject(error ?? new Error('Missing worker diagnostic'));
      } else {
        resolve(value);
      }
    };
    const message = (value: unknown): void => {
      if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'test-diagnostics') {
        return;
      }
      if (
        !('requests' in value)
        || typeof value.requests !== 'number'
        || !('renders' in value)
        || typeof value.renders !== 'number'
        || !('cpu' in value)
        || !value.cpu
        || typeof value.cpu !== 'object'
        || !('user' in value.cpu)
        || typeof value.cpu.user !== 'number'
        || !('system' in value.cpu)
        || typeof value.cpu.system !== 'number'
      ) {
        finish(new Error('Invalid private worker diagnostic'));

        return;
      }
      finish(null, { requests: value.requests, renders: value.renders, cpuUs: value.cpu.user + value.cpu.system });
    };
    const exit = (): void => finish(new Error('Worker exited during measurement'));
    const timer = setTimeout(() => finish(new Error('Worker diagnostic deadline exceeded')), 10000);

    worker.child.on('message', message);
    worker.child.once('exit', exit);

    try {
      worker.child.send({ kind: 'test-diagnostics' });
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Diagnostic IPC failed'));
    }
  });
}

function freeze(worker: IServingProcess, start: number): Promise<{ start: number; end: number }> {
  return new Promise((resolve, reject) => {
    let began: number | null = null;
    const cleanup = (): void => {
      clearTimeout(timer);
      worker.child.off('message', message);
      worker.child.off('exit', exit);
    };
    const message = (value: unknown): void => {
      if (!value || typeof value !== 'object' || !('kind' in value)) {
        return;
      }
      if (value.kind === 'test-freezing') {
        began = performance.now() - start;
      }
      if (value.kind === 'test-thawed' && began !== null) {
        cleanup();
        resolve({ start: began, end: performance.now() - start });
      }
    };
    const exit = (): void => {
      cleanup();
      reject(new Error('Freeze worker exited'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Freeze measurement deadline exceeded'));
    }, 10000);

    worker.child.on('message', message);
    worker.child.once('exit', exit);

    try {
      worker.child.send({ kind: 'test-freeze', durationMs: 5000 });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);

  if (!sorted.length) {
    throw new Error('Missing load measurements');
  }

  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

function summary(samples: readonly ILoadSample[]): {
  readonly requests: number; readonly errors: number; readonly p50: number; readonly p95: number; readonly p99: number;
} {
  const durations = samples.map((sample) => sample.durationMs);

  return {
    requests: samples.length,
    errors: samples.filter((sample) => sample.status !== 200).length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
  };
}

async function traffic(harness: ILoadHarness, durationMs: number, counts: readonly number[], intervalMs: number,
  start: number, signal: AbortSignal): Promise<ILoadSample[]> {
  const samples: ILoadSample[] = [];
  const deadline = performance.now() + durationMs;

  await Promise.all(counts.flatMap((count, index) => Array.from({ length: count }, async () => {
    const site = index === 0 ? 'A' : 'B';
    const host = index === 0 ? 'one.test' : 'two.test';

    while (!signal.aborted && performance.now() < deadline) {
      const at = performance.now();
      let status = 0;

      try {
        status = (await harness.read(host)).status;
      } catch {
        // Transport failure is counted, never dropped or reported as a successful request.
      }
      samples.push({ site, at: at - start, status, durationMs: performance.now() - at });

      try {
        await delay(intervalMs, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
  })));

  return samples;
}

async function snapshots(harness: ILoadHarness): Promise<Map<string, IWorkerDiagnostic & { site: string }>> {
  const workers: IServingProcess[] = [];

  for (const siteId of harness.siteIds) {
    for (let index = 0; index < harness.pool.running(siteId); index++) {
      workers.push(harness.pool.select(siteId));
    }
  }
  const result = await Promise.all(workers.map(async (worker) => [worker.id,
    { ...await diagnostic(worker), site: worker.siteId === harness.siteIds[0] ? 'A' : 'B' }] as const));

  return new Map(result);
}

async function resize(harness: ILoadHarness, a: number, b: number): Promise<void> {
  const state = await harness.resources.read(harness.siteIds);

  await harness.resources.change({
    expectedVersion: state.version,
    databaseCpu: 1,
    sites: [{ siteId: harness.siteIds[0]!, processes: a }, { siteId: harness.siteIds[1]!, processes: b }],
  });
}

export async function runSiteProcessLoad(harness: ILoadHarness): Promise<void> {
  const run = promisify(execFile);
  const container = process.env.ZARYA_TEST_PROCESS_LOAD_DB_CONTAINER;
  let originalQuota: number | null = null;

  if (container) {
    const { stdout } = await run('docker', ['inspect', '--format',
      '{{index .Config.Labels "zarya.task"}} {{.HostConfig.NanoCpus}}', container]);
    const [label, quota] = stdout.trim().split(' ');

    if (label !== '0140-process-tests' || !Number.isSafeInteger(Number(quota))) {
      throw new Error('Load test may control only its explicitly labelled isolated database');
    }
    originalQuota = Number(quota) / 1e9;
    await run('docker', ['update', '--cpus', '1', container]);
  }

  try {
    await resize(harness, 2, 2);
    const warmBefore = await snapshots(harness);
    const warmStart = performance.now();
    const warmup = await traffic(harness, 30000, [2, 2], 200, warmStart, new AbortController().signal);
    const warmAfter = await snapshots(harness);
    const warmupWorkers = [...warmAfter].map(([id, value]) => ({
      site: value.site,
      renders: value.renders - warmBefore.get(id)!.renders,
      requests: value.requests - warmBefore.get(id)!.requests,
      cpuMs: (value.cpuUs - warmBefore.get(id)!.cpuUs) / 1000,
    }));

    if (
      warmupWorkers.some((worker) => worker.renders <= 0)
      || Math.max(...warmupWorkers.map((worker) => worker.requests))
        - Math.min(...warmupWorkers.map((worker) => worker.requests)) > 2
    ) {
      throw new Error('Comparable request load did not reach each equal-pool worker within two requests');
    }

    await resize(harness, 1, 2);
    const before = await snapshots(harness);
    const start = performance.now();
    const cancellation = new AbortController();
    const workload = traffic(harness, 120000, [2, 4], 200, start, cancellation.signal);
    const frozen = (async () => {
      await delay(40000, undefined, { signal: cancellation.signal });
      const measurement = freeze(harness.pool.select(harness.siteIds[0]!), start);
      const screenshot = (async () => {
        await delay(1000);
        await harness.onFreeze();
      })();
      const [result] = await Promise.all([measurement, screenshot]);

      return result;
    })();
    let samples: ILoadSample[];
    let interval: { start: number; end: number };

    try {
      [samples, interval] = await Promise.all([workload, frozen]);
    } finally {
      cancellation.abort();
      await Promise.allSettled([workload, frozen]);
    }
    const after = await snapshots(harness);
    const workers = [...after].map(([id, value]) => ({
      site: value.site,
      requests: value.requests - before.get(id)!.requests,
      renders: value.renders - before.get(id)!.renders,
      cpuMs: (value.cpuUs - before.get(id)!.cpuUs) / 1000,
    }));
    const neighbor = samples.filter((sample) => sample.site === 'B');
    const baseline = summary(neighbor.filter((sample) => sample.at < interval.start));
    const during = summary(neighbor.filter((sample) => sample.at >= interval.start && sample.at < interval.end));
    const recovery = summary(neighbor.filter((sample) => sample.at >= interval.end));
    const allowedIncreaseMs = Math.max(baseline.p95 * 0.2, 20);
    const controlled = during.errors === 0 && during.p95 <= baseline.p95 + allowedIncreaseMs
      && harness.pool.running(harness.siteIds[0]!) === 1 && harness.pool.running(harness.siteIds[1]!) === 2;

    if (container) {
      await run('docker', ['update', '--cpus', '0.25', container]);
    }

    let stress: ILoadSample[];

    try {
      stress = await traffic(harness, 10000, [0, 16], 0, performance.now(), new AbortController().signal);
    } finally {
      if (container) {
        await run('docker', ['update', '--cpus', '1', container]);
      }
    }
    const report = {
      warmupMs: 30000,
      measurementMs: 120000,
      keepAlive: false,
      generator: 'Same host as CMS; measured worker CPU excludes the generator and shared MongoDB',
      warmup: summary(warmup),
      warmupWorkers,
      baseline,
      during,
      recovery,
      allowedIncreaseMs,
      controlled,
      freezeMs: interval.end - interval.start,
      workers,
      stress: {
        databaseCpu: container ? 0.25 : null,
        ...summary(stress),
      },
    };

    await writeFile(path.resolve('.tmp/site-process-load-0140.json'), JSON.stringify(report, null, 2) + '\n');

    if (!controlled || workers.some((worker) => worker.requests <= 0 || worker.renders <= 0)) {
      throw new Error('Freeze isolation or actual rendering load acceptance failed; inspect the measured report');
    }
  } finally {
    if (container && originalQuota !== null) {
      await run('docker', ['update', '--cpus', String(originalQuota), container]);
    }
  }
}
