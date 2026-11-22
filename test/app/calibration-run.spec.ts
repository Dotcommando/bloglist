import { expect, it, vi } from 'vitest';

import { CalibrationJobsService } from '../../src/app/services/calibration/calibration-jobs.service.js';
import { CalibrationSearchService } from '../../src/app/services/calibration/calibration-search.service.js';
import { CalibrationScope } from '../../src/domain/calibration/calibration-profile.js';
import { CalibrationRunStatus, type ICalibrationMeasurement, type ICalibrationRun } from
  '../../src/domain/calibration/calibration-run.js';
import type { ICalibrationRunsPort } from '../../src/ports/outbound/calibration/calibration-runs.port.js';
import type { ICalibrationLoadPort, ICalibrationResourceLease } from
  '../../src/ports/outbound/calibration/calibration-runtime.port.js';
import { calibrationProfile } from '../support/calibration.js';

function fixture(): { run: ICalibrationRun;
  lease: ICalibrationResourceLease;
  runs: ICalibrationRunsPort;
  service: CalibrationSearchService;
  measurements: ICalibrationMeasurement[];
  load: ICalibrationLoadPort } {
  let at = 0;
  let count = 2;
  const original = { databaseCpu: 1, cmsCpu: 3, sitePoolSize: 5, sites: [{ siteId: 'one', processes: 2 }] };
  const run: ICalibrationRun = {
    runId: 'run',
    profile: calibrationProfile(),
    siteIds: ['one'],
    cmsVersion: '0.14.0',
    startedAt: new Date(0),
    finishedAt: null,
    status: CalibrationRunStatus.Running,
    phase: 'Preparing',
    targets: [{
      siteId: 'one',
      path: '/',
      authority: 'one.test',
      share: 10000,
      effectiveShare: 100,
      releaseId: 'release',
    }],
    original,
    generatorPlacement: 'Independent process',
    referenceId: null,
    winnerId: null,
    restored: false,
    error: null,
  };
  const measurements: ICalibrationMeasurement[] = [];
  const runs: ICalibrationRunsPort = {
    create: vi.fn(),
    save: vi.fn(),
    get: vi.fn(),
    latest: vi.fn(),
    append: vi.fn(async measurement => {
      measurements.push(measurement);
    }),
    measurements: vi.fn(),
    interruptRunning: vi.fn(),
  };
  const lease: ICalibrationResourceLease = {
    original,
    read: vi.fn(),
    apply: vi.fn(async config => {
      count = config.sites[0]!.processes;

      return {
        ...config,
        version: 'applied',
        capacity: 4,
        infrastructureCpu: 0,
        logicalCpuCount: 4,
        databasePlacement: 'ManagedLocal',
        databaseEngine: 'MongoDB',
        databaseVersion: 'test',
        databaseImage: null,
        observedDatabaseCpu: 1,
        observedCmsCpu: 3,
        managed: false,
        applyError: null,
        activeDump: false,
        running: { one: count },
        processErrors: { one: null },
      };
    }),
    restore: vi.fn(async () => {
      count = 2;
    }),
  };
  const load: ICalibrationLoadPort = {
    placement: 'Independent process',
    sharesCmsBudget: true,
    measure: vi.fn(async input => {
      at += (input.seconds + input.warmupSeconds) * 1000;
      const metrics = {
        averageMs: 10,
        medianMs: 10,
        p95Ms: 20,
        p99Ms: 25,
        requests: 100,
        errors: 0,
        dropped: 0,
        successfulRps: count === 2 ? 200 : 100,
      };

      return { metrics, siteMetrics: { one: metrics } };
    }),
  };
  let id = 0;
  const service = new CalibrationSearchService(runs, load,
    { now: () => new Date(at), nextId: () => String(++id), nextVersion: () => 'v' });

  return { run, lease, runs, service, measurements, load };
}

it('fails and restores before measuring when add-on composition changes', async () => {
  const f = fixture();
  const service = new CalibrationSearchService(f.runs, f.load,
    { now: () => new Date(0), nextId: () => 'm', nextVersion: () => 'v' },
    { list: async () => [{ siteId: 'one', name: 'One', primaryDomain: 'one.test', addons: [] }] });
  const run = {
    ...f.run,
    addonSnapshots: [{
      siteId: 'one',
      addons: [{
        addonKey: 'fixture',
        implementationVersion: '1.0.0',
        runtimeDigest: 'a'.repeat(64),
        configurationHash: 'b'.repeat(64),
        queries: [],
      }],
    }],
  };

  await service.execute(run, f.lease, new AbortController().signal);
  expect(f.load.measure).not.toHaveBeenCalled();
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({ status: 'Failed', restored: true });
  expect(f.lease.restore).toHaveBeenCalledOnce();
});

it('retains a newly measured baseline and a confirmed winner, restoring before marking completion', async () => {
  const f = fixture();

  await f.service.execute(f.run, f.lease, new AbortController().signal);
  expect(f.measurements.some(m => m.kind === 'Reference' && m.configuration.sites[0]?.processes === 1)).toBe(true);
  const completed = vi.mocked(f.runs.save).mock.calls.at(-1)![0];
  const winner = f.measurements.find(m => m.measurementId === completed.winnerId);

  expect(completed).toMatchObject({ status: CalibrationRunStatus.Completed, restored: true });
  expect(winner).toMatchObject({ kind: 'Confirmation', configuration: { sites: [{ siteId: 'one', processes: 2 }] } });
  expect(f.lease.restore).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.lease.restore).mock.invocationCallOrder[0])
    .toBeLessThan(vi.mocked(f.runs.save).mock.invocationCallOrder.at(-1)!);
});

it.each([0.3, 1, 2, 3])('measures every candidate under a real shared %s CPU budget with all sites', async budget => {
  const f = fixture();
  const original = {
    databaseCpu: 1,
    cmsCpu: 19,
    sitePoolSize: 5,
    sites: [{ siteId: 'one', processes: 3 }, { siteId: 'two', processes: 2 }],
  };
  const run: ICalibrationRun = {
    ...f.run,
    original,
    profile: {
      ...f.run.profile,
      scope: CalibrationScope.Installation,
      siteId: null,
      distributedCpu: budget,
      search: { ...f.run.profile.search, concurrencyLevels: [1], databaseCpuStep: 0.1, maximumSeconds: 10000 },
    },
    siteIds: ['one', 'two'],
    targets: [...f.run.targets, { ...f.run.targets[0]!, siteId: 'two', authority: 'two.test' }],
  };
  const apply = vi.fn(async (configuration: ICalibrationResourceLease['original']) => ({
    ...await f.lease.apply(configuration),
    capacity: 20,
    managed: true,
    databasePools: {
      editable: true,
      sitePoolSize: configuration.sitePoolSize,
      appliedSitePoolSize: configuration.sitePoolSize,
      coordinatorPoolSize: 5,
    },
    observedDatabaseCpu: configuration.databaseCpu,
    observedCmsCpu: configuration.cmsCpu,
    running: Object.fromEntries(configuration.sites.map(site => [site.siteId, site.processes])),
  }));

  vi.mocked(f.load.measure).mockImplementation(async () => {
    const metrics = {
      averageMs: 10,
      medianMs: 10,
      p95Ms: 20,
      p99Ms: 25,
      requests: 100,
      errors: 0,
      dropped: 0,
      successfulRps: 100,
    };

    return { metrics, siteMetrics: { one: metrics, two: metrics } };
  });
  await f.service.execute(run, { ...f.lease, original, apply }, new AbortController().signal);
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({ status: 'Completed', restored: true });
  expect(apply.mock.calls.length).toBeGreaterThan(3);

  for (const [configuration] of apply.mock.calls) {
    expect(configuration.databaseCpu + configuration.cmsCpu).toBeCloseTo(budget, 8);
    expect(Number.isInteger(Math.round(configuration.cmsCpu * 1e8) / 1e7)).toBe(true);
    expect(configuration.sites.map(site => site.siteId)).toEqual(['one', 'two']);
  }
  expect(apply.mock.calls.some(([configuration]) => configuration.sitePoolSize !== 5)).toBe(true);
  expect(new Set(apply.mock.calls.map(([configuration]) => configuration.databaseCpu)).size).toBeGreaterThan(1);
  expect(f.lease.restore).toHaveBeenCalledOnce();
});

it('refuses to measure when observed CPU quotas differ from the requested budget and restores', async () => {
  const f = fixture();
  const run = {
    ...f.run,
    profile: {
      ...f.run.profile,
      scope: CalibrationScope.Installation,
      siteId: null,
      distributedCpu: 3,
    },
  };

  await f.service.execute(run, f.lease, new AbortController().signal);
  expect(f.load.measure).not.toHaveBeenCalled();
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({ status: 'Failed', restored: true });
  expect(f.lease.restore).toHaveBeenCalledOnce();
});

it('restores after a load failure and does not turn fast errors into a recommendation', async () => {
  const f = fixture();

  vi.mocked(f.load.measure).mockRejectedValueOnce(new Error('Synthetic generator failure'));
  await f.service.execute(f.run, f.lease, new AbortController().signal);
  expect(f.lease.restore).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({
    status: CalibrationRunStatus.Failed,
    restored: true,
    winnerId: null,
  });
});

it.each(['empty', 'missing-api', 'foreign-site', 'unmeasured-api'])(
  'refuses a recommendation when positive API-step metrics are %s', async scenario => {
    const f = fixture();
    const measure = vi.mocked(f.load.measure).getMockImplementation()!;

    vi.mocked(f.load.measure).mockImplementation(async (input, signal) => {
      const result = await measure(input, signal);
      const stepMetrics = {
        '["one","/"]': result.metrics,
        '["one","/api/fixture/public"]': {
          ...result.metrics,
          requests: scenario === 'unmeasured-api' ? 0 : result.metrics.requests,
        },
      };

      return {
        ...result,
        stepMetrics: scenario === 'empty' ? {} : scenario === 'missing-api'
          ? { '["one","/"]': result.metrics } : scenario === 'foreign-site'
            ? { '["other","/api/fixture/public"]': result.metrics } : stepMetrics,
      };
    });
    await f.service.execute({
      ...f.run,
      targets: [{
        ...f.run.targets[0]!,
        apiSteps: [{ addonKey: 'fixture', queryId: 'public', path: '/api/fixture/public' }],
      }],
    }, f.lease, new AbortController().signal);
    expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({
      status: CalibrationRunStatus.Failed,
      restored: true,
      winnerId: null,
    });
    expect(f.measurements.length).toBeGreaterThan(0);
    expect(f.measurements.every(measurement => !measurement.passed)).toBe(true);
    expect(f.lease.restore).toHaveBeenCalledOnce();
  },
);

it('confirms measured positive API steps without requiring metrics for zero-share targets', async () => {
  const f = fixture();
  const measure = vi.mocked(f.load.measure).getMockImplementation()!;

  vi.mocked(f.load.measure).mockImplementation(async (input, signal) => {
    const result = await measure(input, signal);

    return {
      ...result,
      stepMetrics: {
        '["one","/"]': result.metrics,
        '["one","/api/fixture/public"]': result.metrics,
      },
    };
  });
  await f.service.execute({
    ...f.run,
    targets: [{
      ...f.run.targets[0]!,
      apiSteps: [{ addonKey: 'fixture', queryId: 'public', path: '/api/fixture/public' }],
    }, {
      ...f.run.targets[0]!,
      path: '/unpublished',
      share: 0,
      effectiveShare: 0,
      apiSteps: [{ addonKey: 'fixture', queryId: 'unused', path: '/api/fixture/unused' }],
    }],
  }, f.lease, new AbortController().signal);
  const completed = vi.mocked(f.runs.save).mock.calls.at(-1)![0];

  expect(completed).toMatchObject({ status: CalibrationRunStatus.Completed, restored: true });
  expect(f.measurements.find(measurement => measurement.measurementId === completed.winnerId))
    .toMatchObject({ kind: 'Confirmation', passed: true });
  expect(f.lease.restore).toHaveBeenCalledOnce();
});

it('keeps failed restoration visible and without an applicable winner', async () => {
  const f = fixture();

  vi.mocked(f.lease.restore).mockRejectedValueOnce(new Error('Synthetic restoration failure'));
  await f.service.execute(f.run, f.lease, new AbortController().signal);
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({
    status: CalibrationRunStatus.RestorationRequired,
    restored: false,
    winnerId: null,
  });
});

it('observes cancellation before admission to a measurement and still restores', async () => {
  const f = fixture();
  const abort = new AbortController();

  abort.abort();
  await f.service.execute(f.run, f.lease, abort.signal);
  expect(f.load.measure).not.toHaveBeenCalled();
  expect(f.lease.restore).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0]).toMatchObject({ status: CalibrationRunStatus.Cancelled });
});

it('retries a failed final history write after restoration, instead of leaving the UI running forever', async () => {
  const f = fixture();
  let failed = false;

  vi.mocked(f.runs.save).mockImplementation(async run => {
    if (run.status !== CalibrationRunStatus.Running && !failed) {
      failed = true;
      throw new Error('Synthetic final history write failure');
    }
  });
  const jobs = new CalibrationJobsService(f.service, f.runs);

  jobs.start(f.run, f.lease);
  await expect.poll(() => failed).toBe(true);
  await jobs.flush();
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0])
    .toMatchObject({ status: CalibrationRunStatus.Completed, restored: true });
  await jobs.cancel(f.run.runId);
});

it('cancels a running generator during shutdown and restores before the task settles', async () => {
  const f = fixture();
  let entered = false;

  vi.mocked(f.load.measure).mockImplementationOnce((_input, signal) => new Promise((_resolve, reject) => {
    entered = true;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const jobs = new CalibrationJobsService(f.service, f.runs);

  jobs.start(f.run, f.lease);
  await expect.poll(() => entered).toBe(true);
  await jobs.onModuleDestroy();
  expect(f.lease.restore).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.runs.save).mock.calls.at(-1)![0])
    .toMatchObject({ status: CalibrationRunStatus.Cancelled, restored: true });
});
