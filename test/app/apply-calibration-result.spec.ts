import { expect, it, vi } from 'vitest';

import {
  ApplyCalibrationResultUseCase,
} from '../../src/app/use-cases/calibration/apply-calibration-result.use-case.js';
import { CalibrationMeasurementKind, CalibrationRunStatus, type ICalibrationMeasurement, type ICalibrationRun } from
  '../../src/domain/calibration/calibration-run.js';
import type { IInstallationResourceState } from '../../src/domain/resources/installation-resources.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { ICalibrationRunsPort } from '../../src/ports/outbound/calibration/calibration-runs.port.js';
import { calibrationProfile } from '../support/calibration.js';
import { currentAdmin } from '../support/current-admin.js';

const state: IInstallationResourceState = {
  capacity: 6,
  infrastructureCpu: 0,
  databaseCpu: 2,
  cmsCpu: 4,
  databasePlacement: DatabasePlacement.ManagedLocal,
  logicalCpuCount: 6,
  databaseEngine: 'MongoDB',
  databaseVersion: 'test',
  databaseImage: null,
  observedDatabaseCpu: 2,
  observedCmsCpu: 4,
  managed: false,
  version: 'current',
  applyError: null,
  activeDump: false,
  sites: [{ siteId: 'one', processes: 2 },
    { siteId: 'two', processes: 4 }],
  running: { one: 2, two: 4 },
  processErrors: { one: null, two: null },
};

const configuration = {
  databaseCpu: 1,
  cmsCpu: 3,
  sitePoolSize: 10,
  sites: [{ siteId: 'one', processes: 3 }, { siteId: 'two', processes: 9 }],
};

const run: ICalibrationRun = {
  runId: 'run',
  addonSnapshots: [{ siteId: 'one', addons: [] }],
  profile: calibrationProfile(),
  cmsVersion: '0.14.0',
  siteIds: ['one'],
  startedAt: new Date(),
  finishedAt: new Date(),
  status: CalibrationRunStatus.Completed,
  phase: 'Finished',
  targets: [],
  original: configuration,
  winnerId: 'winner',
  referenceId: null,
  generatorPlacement: 'test',
  restored: true,
  error: null,
};

const measurement: ICalibrationMeasurement = {
  measurementId: 'winner',
  runId: 'run',
  kind: CalibrationMeasurementKind.Confirmation,
  configuration,
  observed: state,
  concurrency: 4,
  startedAt: new Date(),
  finishedAt: new Date(),
  passed: true,
  siteMetrics: {},
  metrics: {
    averageMs: 10,
    medianMs: 10,
    p95Ms: 10,
    p99Ms: 10,
    requests: 10,
    errors: 0,
    dropped: 0,
    successfulRps: 10,
  },
};

function runs(candidate = measurement): ICalibrationRunsPort {
  return {
    create: vi.fn(),
    save: vi.fn(),
    append: vi.fn(),
    interruptRunning: vi.fn(),
    get: async () => run,
    latest: vi.fn(),
    measurements: async () => [candidate],
  };
}

it('rejects a recommendation after the measured site add-on runtime changes', async () => {
  const resources = { read: async () => state, change: vi.fn(async () => {}) };
  const addon = {
    addonKey: 'fixture',
    implementationVersion: '1.0.0',
    runtimeDigest: 'a'.repeat(64),
    configurationHash: 'b'.repeat(64),
    queries: [],
  };
  const retained = { ...run, addonSnapshots: [{ siteId: 'one', addons: [addon] }] };
  const changed = {
    list: async () => [{
      siteId: 'one',
      name: 'One',
      primaryDomain: 'one.test',
      addons: [{ ...addon, runtimeDigest: 'c'.repeat(64), implementationVersion: '1.1.0' }],
    }],
  };

  await expect(new ApplyCalibrationResultUseCase({ ...runs(), get: async () => retained }, resources,
    changed, { execute: async () => currentAdmin() }).execute({
    token: 'valid',
    runId: 'run',
    expectedVersion: 'current',
  })).rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
  expect(resources.change).not.toHaveBeenCalled();
});

const sites = {
  list: async () => [{ siteId: 'one', name: 'One', primaryDomain: 'one.test' },
    { siteId: 'two', name: 'Two', primaryDomain: 'two.test' }],
};

const current = { execute: async () => currentAdmin() };

it('applies only the selected site and preserves current shared settings and its neighbour', async () => {
  const resources = { read: async () => state, change: vi.fn(async () => {}) };

  await new ApplyCalibrationResultUseCase(runs(), resources, sites, current)
    .execute({ token: 'valid', runId: 'run', expectedVersion: 'current' });
  expect(resources.change).toHaveBeenCalledExactlyOnceWith({
    expectedVersion: 'current',
    databaseCpu: 2,
    sites: [{ siteId: 'one', processes: 3 }, { siteId: 'two', processes: 4 }],
  });
});

it('rejects stale resource versions and never applies an unconfirmed probe', async () => {
  const resources = { read: async () => state, change: vi.fn(async () => {}) };
  const apply = new ApplyCalibrationResultUseCase(runs({ ...measurement, kind: CalibrationMeasurementKind.Probe }),
    resources, sites, current);

  await expect(apply.execute({ token: 'valid', runId: 'run', expectedVersion: 'old' }))
    .rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
  await expect(apply.execute({ token: 'valid', runId: 'run', expectedVersion: 'current' }))
    .rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
  expect(resources.change).not.toHaveBeenCalled();
});
