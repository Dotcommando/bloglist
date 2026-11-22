import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertCaptureLease, captureJobRoot, recoverCaptureJobs,
} from '../../src/adapters/outbound/backup/files/dump-capture-lease.js';

it('binds a capture job to the parent lock and site and refuses recovery of live jobs', async () => {
  const root = await mkdtemp(path.resolve('.tmp/capture-lease-'));
  const jobId = randomUUID();
  const job = captureJobRoot(root, jobId);
  const lease = { jobId, parentPid: process.pid, childPid: null, siteId: 's' };

  try {
    await mkdir(path.join(root, '.coordination'), { recursive: true });
    await writeFile(path.join(root, '.coordination/.operation.lock'), String(process.pid));
    await mkdir(job, { recursive: true });
    await writeFile(path.join(job, '.lease.json'), JSON.stringify(lease));
    await expect(assertCaptureLease(root, lease)).resolves.toBeUndefined();
    await expect(assertCaptureLease(root, { ...lease, siteId: 'foreign' })).rejects.toThrow();
    await expect(recoverCaptureJobs(root)).rejects.toThrow();
    expect(await readFile(path.join(job, '.lease.json'), 'utf8')).toContain(jobId);
    await writeFile(path.join(root, '.coordination/.operation.lock'), '0');
    await expect(assertCaptureLease(root, lease)).rejects.toThrow();
    expect(() => captureJobRoot(root, '../foreign')).toThrow();
  } finally {
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});
