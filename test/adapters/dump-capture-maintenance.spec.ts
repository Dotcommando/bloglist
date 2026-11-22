import { DumpMaintenance } from '../../src/adapters/outbound/backup/files/dump-maintenance.js';

it('drains existing requests, then permits reads while capture excludes writers and restoration', async () => {
  const maintenance = new DumpMaintenance();
  const releasePrevious = maintenance.enter();
  let finish!: () => void;
  let started = false;
  const capture = maintenance.run(() => {
    started = true;

    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  }, true);
  const observed = Promise.allSettled([capture]);

  expect(started).toBe(false);
  expect(() => maintenance.enter(true)).toThrow();
  releasePrevious();
  await Promise.resolve();
  expect(started).toBe(true);
  expect(maintenance.captureActive).toBe(true);
  const releaseRead = maintenance.enter(true);

  expect(() => maintenance.enter()).toThrow();
  await expect(maintenance.run(async () => {})).rejects.toThrow();
  releaseRead();
  finish();
  expect((await observed)[0]).toMatchObject({ status: 'fulfilled' });
  expect(maintenance.captureActive).toBe(false);
  const release = maintenance.enter();

  release();
});
