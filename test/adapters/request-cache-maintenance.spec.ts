import { DumpMaintenance } from '../../src/adapters/outbound/backup/files/dump-maintenance.js';

it('invalidates before and after replacement, including a failed restore', async () => {
  const calls: string[] = [];
  const maintenance = new DumpMaintenance(() => {
    calls.push('purge');
  });

  await maintenance.run(async () => {
    calls.push('restore');
  });
  expect(calls).toEqual(['purge', 'restore', 'purge']);
  calls.length = 0;
  await expect(maintenance.run(async () => {
    calls.push('failure');
    throw new Error('failed');
  })).rejects.toThrow();
  expect(calls).toEqual(['purge', 'failure', 'purge']);
});
