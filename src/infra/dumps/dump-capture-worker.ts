import 'reflect-metadata';

import { createConnection } from 'mongoose';

import {
  assertCaptureLease, captureJobRoot, type IDumpCaptureLease,
} from '../../adapters/outbound/backup/files/dump-capture-lease.js';
import { InstallationDumpStore } from '../../adapters/outbound/backup/files/installation-dump.adapter.js';
import type { IPartialAddonExport } from '../../adapters/outbound/backup/files/partial-dump.adapter.js';
import { FileAddonDumpTransfer } from '../../adapters/outbound/backup/files/partial-dump-addons.js';
import {
  FileSiteDumpStore, type IDumpStorageSettings,
} from '../../adapters/outbound/backup/files/site-dump-store.adapter.js';
import { DumpDatabase } from '../../adapters/outbound/backup/mongoose/dump-database.adapter.js';
import {
  CaptureMessageKind, type IDumpCaptureStart,
} from '../../adapters/outbound/backup/process/dump-capture.protocol.js';
import { validateDumpCreation } from '../../domain/dumps/dump-selection.policy.js';
import { type ISiteDump, SiteDumpType } from '../../domain/dumps/site-dump.js';
import { BusinessError } from '../../domain/shared/business-error.js';

class LeasedDumpCaptureStore extends FileSiteDumpStore {
  constructor(settings: IDumpStorageSettings, database: DumpDatabase, exporter: IPartialAddonExport,
    private readonly ownerRoot: string, private readonly lease: IDumpCaptureLease) {
    super(settings, database, undefined, undefined, exporter);
  }

  protected override async exclusive<T>(action: () => Promise<T>): Promise<T> {
    await assertCaptureLease(this.ownerRoot, this.lease);
    const result = await action();

    await assertCaptureLease(this.ownerRoot, this.lease);

    return result;
  }
}

async function capture(job: IDumpCaptureStart): Promise<ISiteDump> {
  const mongoUri = process.env.ZARYA_DUMP_CAPTURE_MONGO_URI;

  if (
    job.kind !== CaptureMessageKind.Start
    || job.lease.parentPid !== process.ppid
    || job.lease.childPid !== process.pid
    || job.stagingRoot !== captureJobRoot(job.storage.root, job.lease.jobId)
    || !/^[A-Za-z0-9_-]{1,128}$/.test(job.lease.siteId)
    || typeof mongoUri !== 'string'
    || !mongoUri
    || typeof job.database !== 'string'
  ) {
    throw new Error('Invalid capture job');
  }
  if (job.options) {
    validateDumpCreation(job.options);
  }
  await assertCaptureLease(job.storage.root, job.lease);
  const connection = createConnection(mongoUri, {
    dbName: job.database,
    autoIndex: false,
    autoCreate: false,
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  try {
    await connection.asPromise();

    if (job.options?.type === SiteDumpType.Installation) {
      const installation = new InstallationDumpStore({ ...job.storage, root: job.stagingRoot },
        connection, job.storage.root);
      const result = await installation.create();

      await assertCaptureLease(job.storage.root, job.lease);

      return result;
    }

    const exporter: IPartialAddonExport = {
      records: (siteId, options, documents) =>
        FileAddonDumpTransfer.exportRecords(job.addonMetadata, siteId, options, documents),
    };
    const store = new LeasedDumpCaptureStore({ ...job.storage, root: job.stagingRoot }, new DumpDatabase(connection),
      exporter, job.storage.root, job.lease);

    return await store.create(job.lease.siteId, job.options);
  } finally {
    await connection.close();
  }
}

function send(message: Record<string, unknown>, status: number): void {
  try {
    if (!process.send || !process.connected) {
      process.exit(1);
    }
    process.send({ ...message, pid: process.pid }, (error: unknown) => process.exit(error ? 1 : status));
  } catch {
    process.exit(1);
  }
}

let started = false;

process.on('disconnect', () => process.exit(1));

process.on('message', (job: IDumpCaptureStart) => {
  if (started) {
    process.exit(1);
  }
  started = true;
  void capture(job).then((result) => send({ kind: CaptureMessageKind.Result, jobId: job.lease.jobId, result }, 0),
    (error: unknown) => send({
      kind: CaptureMessageKind.Failure,
      jobId: job.lease?.jobId,
      ...(error instanceof BusinessError ? { code: error.code } : {}),
    }, 1));
});
