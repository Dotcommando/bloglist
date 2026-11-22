import { expect, it } from 'vitest';

import { calibrationAvailabilityReadError, CalibrationBlocker, calibrationBlockers } from
  '../../admin/src/features/calibration/calibration-availability.js';
import { type IResourceView, ResourceDatabasePlacement } from '../../admin/src/features/resources/resources-api.js';

const capabilities = { processSupervisor: true, externalGenerator: true };

const ready: IResourceView = {
  version: 'version',
  capacity: 6,
  infrastructureCpu: 0,
  databaseCpu: 1,
  cmsCpu: 5,
  cmsCpuBudget: null,
  databasePlacement: ResourceDatabasePlacement.ManagedLocal,
  observedDatabaseCpu: 1,
  observedCmsCpu: 5,
  databaseVersion: 'test',
  databaseImage: 'mongo:test',
  recommendation: 5,
  unallocated: 3,
  managed: true,
  allocationEditable: true,
  activeDump: false,
  dumpSiteId: null,
  applyError: null,
  databasePools: { sitePoolSize: 5, appliedSitePoolSize: 5, coordinatorPoolSize: 5, editable: true },
  sites: [{
    siteId: 'one', name: 'One', domain: 'one.test', processes: 2, running: 2, error: null, dumpMode: 'BorrowedProcess',
  }],
};

it('does not invent blockers while observations are missing or when all observed prerequisites are ready', () => {
  expect(calibrationBlockers(null, null, 'ru')).toEqual([]);
  expect(calibrationBlockers(ready, capabilities, 'ru')).toEqual([]);
});

it('explains missing CMS quota control with Docker startup guidance in both languages', () => {
  for (const language of ['en', 'ru'] as const) {
    const russian = language === 'ru';
    const result = calibrationBlockers({
      ...ready,
      managed: false,
      databaseImage: null,
      observedDatabaseCpu: null,
      observedCmsCpu: null,
    }, { ...capabilities, externalGenerator: false }, language);

    expect(result.map(row => row.code)).toEqual([CalibrationBlocker.Control]);
    expect(result[0]!.reason).toContain(russian ? 'не подключена' : 'not connected');
    expect(result[0]!.action).toContain('resource-control');
    expect(result[0]!.action).toContain(russian ? 'Остановите текущий HTTP-процесс'
      : 'Stop the current HTTP application');
    expect(result[0]!.action).toContain(russian ? 'Обновить' : 'Refresh');
  }
});

it('distinguishes helper connectivity from unconfirmed actual quotas', () => {
  expect(calibrationBlockers({ ...ready, databaseImage: null }, capabilities, 'ru')[0]?.code)
    .toBe(CalibrationBlocker.Helper);
  expect(calibrationBlockers({ ...ready, observedCmsCpu: null }, capabilities, 'ru')[0]?.code)
    .toBe(CalibrationBlocker.Quotas);
  expect(calibrationBlockers({ ...ready, observedDatabaseCpu: 2 }, capabilities, 'ru')[0]?.code)
    .toBe(CalibrationBlocker.Quotas);
});

it('explains missing supervisor, independent generator and pool control separately', () => {
  expect(calibrationBlockers(ready, { ...capabilities, processSupervisor: false }, 'en').map(row => row.code))
    .toEqual([CalibrationBlocker.Supervisor]);
  expect(calibrationBlockers(ready, { ...capabilities, externalGenerator: false }, 'en').map(row => row.code))
    .toEqual([CalibrationBlocker.Generator]);
  expect(calibrationBlockers({ ...ready, databasePools: { ...ready.databasePools!, editable: false } },
    capabilities, 'en').map(row => row.code)).toEqual([CalibrationBlocker.Pools]);
});

it('reports active operations, incomplete allocation and worker readiness without blaming Docker configuration', () => {
  expect(calibrationBlockers({ ...ready, activeDump: true }, capabilities, 'en').map(row => row.code))
    .toEqual([CalibrationBlocker.Dump]);
  expect(calibrationBlockers({ ...ready, applyError: 'private technical details' }, capabilities, 'en')
    .map(row => row.code)).toEqual([CalibrationBlocker.Application]);
  const result = calibrationBlockers({ ...ready, sites: [{ ...ready.sites[0]!, running: 1 }] }, capabilities, 'en');

  expect(result.map(row => row.code)).toEqual([CalibrationBlocker.Workers]);
  expect(result[0]?.action).toContain('General → Resources');
});

it.each([ResourceDatabasePlacement.Remote, ResourceDatabasePlacement.UnmanagedLocal])(
  'explains why shared database CPU cannot be calibrated with %s placement', databasePlacement => {
    const result = calibrationBlockers({ ...ready, databasePlacement, managed: false }, capabilities, 'en');

    expect(result[0]?.code).toBe(CalibrationBlocker.Control);
    expect(result[0]?.action).toContain('managed local database');
  });

it('reports an unknown cause on a read failure instead of displaying stale Docker advice', () => {
  expect(calibrationAvailabilityReadError(503, 'ru')).toContain('HTTP 503');
  expect(calibrationAvailabilityReadError(0, 'en')).toContain('has not been determined');
  expect(calibrationAvailabilityReadError(503, 'en')).not.toContain('Docker');
});
