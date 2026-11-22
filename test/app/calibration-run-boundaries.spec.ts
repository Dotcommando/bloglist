import { CalibrationJobsService } from '../../src/app/services/calibration/calibration-jobs.service.js';
import { CalibrationSearchService } from '../../src/app/services/calibration/calibration-search.service.js';
import { CancelCalibrationRunUseCase } from '../../src/app/use-cases/calibration/cancel-calibration-run.use-case.js';
import { ReadCalibrationRunsUseCase } from '../../src/app/use-cases/calibration/read-calibration-runs.use-case.js';
import type { ICalibrationRunsPort } from '../../src/ports/outbound/calibration/calibration-runs.port.js';
import { currentAdmin } from '../support/current-admin.js';

function fixture(): {
  runs: ICalibrationRunsPort;
  jobs: CalibrationJobsService;
  current: { execute: ReturnType<typeof vi.fn<() => Promise<ReturnType<typeof currentAdmin>> >> };
} {
  const runs: ICalibrationRunsPort = {
    create: vi.fn(),
    save: vi.fn(),
    get: vi.fn(async () => null),
    latest: vi.fn(async () => []),
    append: vi.fn(),
    measurements: vi.fn(async () => []),
    interruptRunning: vi.fn(),
  };
  const search = new CalibrationSearchService(runs, {
    placement: 'Synthetic',
    sharesCmsBudget: false,
    measure: async () => {
      throw new Error('Unexpected generator work');
    },
  }, { now: () => new Date(0), nextId: () => 'id', nextVersion: () => 'v' });

  return {
    runs,
    jobs: new CalibrationJobsService(search, runs),
    current: { execute: vi.fn(async () => currentAdmin()) },
  };
}

it.each(['history', 'detail', 'cancel'])('denies calibration %s before data reads or job control', async action => {
  const f = fixture();
  const denied = new Error('Synthetic invalid session');
  const flush = vi.spyOn(f.jobs, 'flush');
  const cancel = vi.spyOn(f.jobs, 'cancel');
  const read = new ReadCalibrationRunsUseCase(f.runs, f.current, f.jobs);

  f.current.execute.mockRejectedValueOnce(denied);
  const result = action === 'history' ? read.execute({ token: null, siteId: 'one' })
    : action === 'detail' ? read.detail({ token: null, runId: 'run' })
      : new CancelCalibrationRunUseCase(f.jobs, f.current).execute({ token: null, runId: 'run' });

  await expect(result).rejects.toBe(denied);
  expect(flush).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(f.runs.get).not.toHaveBeenCalled();
  expect(f.runs.latest).not.toHaveBeenCalled();
  expect(f.runs.measurements).not.toHaveBeenCalled();
});

it('propagates failed history reconciliation before exposing a stale history read', async () => {
  const f = fixture();
  const failure = new Error('Synthetic final-state persistence failure');

  vi.spyOn(f.jobs, 'flush').mockRejectedValueOnce(failure);
  await expect(new ReadCalibrationRunsUseCase(f.runs, f.current, f.jobs)
    .execute({ token: 'valid', siteId: 'one' })).rejects.toBe(failure);
  expect(f.runs.latest).not.toHaveBeenCalled();
});

it('uses the bounded site history and does not read measurements for an absent run', async () => {
  const f = fixture();
  const read = new ReadCalibrationRunsUseCase(f.runs, f.current, f.jobs);

  await read.execute({ token: 'valid', siteId: 'one' });
  expect(f.runs.latest).toHaveBeenCalledExactlyOnceWith('one', 10);
  await expect(read.detail({ token: 'valid', runId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
  expect(f.runs.get).toHaveBeenCalledExactlyOnceWith('missing');
  expect(f.runs.measurements).not.toHaveBeenCalled();
});

it('propagates cancellation/restoration failure for the exact requested run', async () => {
  const f = fixture();
  const failure = new Error('Synthetic restoration failure');
  const cancel = vi.spyOn(f.jobs, 'cancel').mockRejectedValueOnce(failure);

  await expect(new CancelCalibrationRunUseCase(f.jobs, f.current)
    .execute({ token: 'valid', runId: 'run-a' })).rejects.toBe(failure);
  expect(cancel).toHaveBeenCalledExactlyOnceWith('run-a');
});
