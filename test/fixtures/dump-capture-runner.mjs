import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

process.on('message', (job) => {
  const run = async () => {
    const mode = job.options?.itemIds?.[0];

    if ('mongoUri' in job || !process.env.ZARYA_DUMP_CAPTURE_MONGO_URI) {
      throw new Error('Database credentials must stay outside IPC');
    }
    if (mode === 'crash') {
      process.exit(7);
    }
    if (mode === 'hold') {
      return;
    }

    const createdAt = new Date();
    const filename = createdAt.toISOString().replace(/[:.]/g, '-') + '_' + randomUUID() + '.jsonl.gz';
    const directory = path.join(job.stagingRoot, job.lease.siteId);

    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), 'synthetic archive');
    const result = {
      filename: mode === 'foreign' ? '../foreign.jsonl.gz' : filename,
      createdAt,
      byteSize: 17,
      type: job.options?.type ?? 'Site',
    };

    process.send({ kind: 'result', jobId: job.lease.jobId, result, pid: process.pid }, () => process.exit(0));
  };

  void run().catch(() => process.exit(1));
});

process.on('disconnect', () => process.exit(1));
