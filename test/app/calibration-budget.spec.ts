import { expect, it, vi } from 'vitest';

import { CalibrationJobsService } from '../../src/app/services/calibration/calibration-jobs.service.js';
import { CalibrationSearchService } from '../../src/app/services/calibration/calibration-search.service.js';
import { StartCalibrationRunUseCase } from '../../src/app/use-cases/calibration/start-calibration-run.use-case.js';
import { CalibrationScope, type ICalibrationProfile } from '../../src/domain/calibration/calibration-profile.js';
import type { IInstallationResourceState } from '../../src/domain/resources/installation-resources.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { ICalibrationRunsPort } from '../../src/ports/outbound/calibration/calibration-runs.port.js';
import type { ICalibrationPageResolverPort } from '../../src/ports/outbound/calibration/calibration-runtime.port.js';
import type { IInstallationResourcesPort } from '../../src/ports/outbound/resources/installation-resources.port.js';
import { calibrationProfile } from '../support/calibration.js';
import { currentAdmin } from '../support/current-admin.js';

function fixture(): {
  profile: ICalibrationProfile;
  state: IInstallationResourceState;
  resources: IInstallationResourcesPort;
  runs: ICalibrationRunsPort;
  pages: ICalibrationPageResolverPort;
  jobs: CalibrationJobsService;
  operation: StartCalibrationRunUseCase;
} {
  const profile = calibrationProfile();
  const runs: ICalibrationRunsPort = {
    create: vi.fn(),
    save: vi.fn(),
    get: vi.fn(),
    latest: vi.fn(),
    append: vi.fn(),
    measurements: vi.fn(),
    interruptRunning: vi.fn(),
  };
  const state: IInstallationResourceState = {
    managed: false,
    activeDump: false,
    applyError: null,
    capacity: 20,
    infrastructureCpu: 0,
    version: 'v',
    databaseCpu: 1,
    cmsCpu: 19,
    sites: [{ siteId: 'one', processes: 1 }],
    databasePlacement: DatabasePlacement.ManagedLocal,
    logicalCpuCount: 20,
    databaseEngine: 'MongoDB',
    databaseVersion: 'test',
    databaseImage: null,
    observedCmsCpu: null,
    observedDatabaseCpu: null,
    databasePools: { editable: true, sitePoolSize: 5, appliedSitePoolSize: 5, coordinatorPoolSize: 5 },
    running: { one: 1 },
    processErrors: { one: null },
  };
  const resources: IInstallationResourcesPort = {
    read: async () => state, change: vi.fn(), beginCalibration: vi.fn(),
  };
  const pages: ICalibrationPageResolverPort = { resolve: vi.fn(async () => []) };
  const load = { placement: 'Host generator', sharesCmsBudget: false, measure: vi.fn() };
  const values = { now: () => new Date(0), nextId: () => 'run', nextVersion: () => 'v' };
  const jobs = new CalibrationJobsService(new CalibrationSearchService(runs, load, values), runs);
  const operation = new StartCalibrationRunUseCase(
    { get: async () => profile, create: vi.fn(), replace: vi.fn(), remove: vi.fn(), list: vi.fn() },
    runs,
    { execute: async () => currentAdmin() },
    { list: async () => [{ siteId: 'one', name: 'One', primaryDomain: 'one.test' }] },
    resources, pages, load, jobs, values, '0.14.0',
  );

  return { profile, state, resources, runs, pages, jobs, operation };
}

it('rejects a legacy site-only run instead of pretending that its declared CPU budget was enforced', async () => {
  const f = fixture();

  Object.assign(f.state, { managed: true });
  await expect(f.operation.execute({ token: 'valid', profileId: 'profile', expectedVersion: 'v1' }))
    .rejects.toMatchObject({ code: BusinessErrorCode.Validation });
  expect(f.resources.beginCalibration).not.toHaveBeenCalled();
  expect(f.pages.resolve).not.toHaveBeenCalled();
  expect(f.runs.create).not.toHaveBeenCalled();
});

it('rejects a full CPU-budget run without actual resource control before reserving or generating load', async () => {
  const f = fixture();

  Object.assign(f.profile, { scope: CalibrationScope.Installation, siteId: null, distributedCpu: 3 });
  await expect(f.operation.execute({ token: 'valid', profileId: 'profile', expectedVersion: 'v1' }))
    .rejects.toMatchObject({ code: BusinessErrorCode.Validation });
  expect(f.resources.beginCalibration).not.toHaveBeenCalled();
  expect(f.pages.resolve).not.toHaveBeenCalled();
  expect(f.runs.create).not.toHaveBeenCalled();
});
