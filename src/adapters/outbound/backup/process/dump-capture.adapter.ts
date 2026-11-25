import { type ChildProcess, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateDumpCreation } from '../../../../domain/dumps/dump-selection.policy.js';
import { type ISiteDump, type ISiteDumpCreation, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ISiteDumpCapturePort } from '../../../../ports/outbound/dumps/site-dump-capture.port.js';
import type { IAddonDumpMetadata } from '../../runtime/addons/addon-package-registry.js';
import {
  assertCaptureLease, captureJobRoot, type IDumpCaptureLease, removeCaptureJob,
} from '../files/dump-capture-lease.js';
import { checked, child, missing } from '../files/dump-files.js';
import { installationArchiveDirectory } from '../files/installation-dump.adapter.js';
import type { IDumpStorageSettings } from '../files/site-dump-store.adapter.js';
import {
  CaptureMessageKind, type IDumpCaptureStart,
  readCaptureMessage, readCompletedDump,
} from './dump-capture.protocol.js';

interface ICaptureProcessSettings {
  readonly runner: URL;
  readonly storage: IDumpStorageSettings;
  readonly mongoUri: string;
  readonly database: string;
  readonly addonMetadata: () => IAddonDumpMetadata;
  readonly timeoutMs?: number;
}

export class ProcessDumpCaptureAdapter implements ISiteDumpCapturePort {
  private readonly settings: ICaptureProcessSettings;
  private current: Promise<ISiteDump> | null = null;
  private cancellation: AbortController | null = null;
  private child: ChildProcess | null = null;
  private closed = false;

  constructor(settings: ICaptureProcessSettings) {
    const timeoutMs = settings.timeoutMs ?? 1800000;

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1800000) {
      throw new RangeError('Invalid dump capture deadline');
    }
    this.settings = Object.freeze({
      ...settings,
      runner: new URL(settings.runner),
      timeoutMs,
      storage: Object.freeze({
        ...settings.storage,
        root: path.resolve(settings.storage.root),
        sourcesRoot: path.resolve(settings.storage.sourcesRoot),
        artifactsRoot: path.resolve(settings.storage.artifactsRoot),
        ...(settings.storage.mediaRoot ? { mediaRoot: path.resolve(settings.storage.mediaRoot) } : {}),
      }),
    });
  }

  capture(siteId: string, options?: ISiteDumpCreation, signal?: AbortSignal): Promise<ISiteDump> {
    return this.captureForProcess(process.pid, siteId, options, signal);
  }

  async captureForProcess(operationOwnerPid: number, siteId: string, options?: ISiteDumpCreation,
    signal?: AbortSignal): Promise<ISiteDump> {
    if (!Number.isSafeInteger(operationOwnerPid) || operationOwnerPid < 1) {
      throw new Error('Invalid capture operation owner');
    }
    signal?.throwIfAborted();

    if (this.closed || this.current) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Another dump capture is active');
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid site identity');
    }
    if (options) {
      validateDumpCreation(options);
    }

    const cancellation = new AbortController();

    this.cancellation = cancellation;
    const combined = signal ? AbortSignal.any([signal, cancellation.signal]) : cancellation.signal;
    const timer = setTimeout(
      () => cancellation.abort(new Error('Dump capture deadline exceeded')), this.settings.timeoutMs!,
    );
    const work = this.perform(siteId, options, combined, operationOwnerPid);

    this.current = work;

    try {
      return await work;
    } finally {
      clearTimeout(timer);
      this.current = null;
      this.cancellation = null;
    }
  }

  private async perform(
    siteId: string, options: ISiteDumpCreation | undefined, signal: AbortSignal, operationOwnerPid: number,
  ): Promise<ISiteDump> {
    const root = this.settings.storage.root;
    const jobId = randomUUID();
    const stagingRoot = captureJobRoot(root, jobId);
    let created = false;
    let spawned: ChildProcess | null = null;
    let exited: Promise<{ code: number | null; failed: boolean }> | null = null;
    let abort: (() => void) | undefined;

    try {
      signal.throwIfAborted();
      const lock = await readFile(child(root, '.coordination/.operation.lock'), 'utf8');

      if (lock !== String(operationOwnerPid)) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'A serving-process capture lease is required');
      }
      await mkdir(path.dirname(stagingRoot), { recursive: true, mode: 0o700 });
      const jobsDirectory = await lstat(path.dirname(stagingRoot));

      if (!jobsDirectory.isDirectory() || jobsDirectory.isSymbolicLink()) {
        throw new Error('Invalid capture staging root');
      }
      await mkdir(stagingRoot, { mode: 0o700 });
      created = true;
      const initial: IDumpCaptureLease = { jobId, siteId, parentPid: process.pid, operationOwnerPid, childPid: null };

      await writeFile(path.join(stagingRoot, '.lease.json'), JSON.stringify(initial), { mode: 0o600, flag: 'wx' });
      signal.throwIfAborted();
      let complete!: (value: Record<string, unknown>) => void;
      const completion = new Promise<Record<string, unknown>>((resolve) => {
        complete = resolve;
      });

      spawned = fork(this.settings.runner, [], {
        execPath: process.execPath,
        execArgv: ['--max-old-space-size=512'],
        serialization: 'advanced',
        env: { ...process.env, ZARYA_DUMP_CAPTURE_MONGO_URI: this.settings.mongoUri },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const worker = spawned;

      this.child = worker;
      exited = new Promise((resolve) => {
        worker.on('error', () => {
          complete({ kind: CaptureMessageKind.Failure });

          if (!worker.pid) {
            resolve({ code: null, failed: true });
          }
        });
        worker.once('exit', (code) => {
          complete({ kind: CaptureMessageKind.Failure });
          resolve({ code, failed: false });
        });
      });
      worker.on('message', (value: unknown) => {
        try {
          const message = readCaptureMessage(value);

          if (
            message.jobId === jobId
            && message.pid === worker.pid
            && Buffer.byteLength(JSON.stringify(message)) <= 2097152
          ) {
            complete(message);
          }
        } catch {
          complete({ kind: CaptureMessageKind.Failure });
        }
      });
      abort = () => {
        complete({ kind: CaptureMessageKind.Failure });
        worker.kill('SIGKILL');
      };
      signal.addEventListener('abort', abort, { once: true });
      signal.throwIfAborted();

      if (!worker.pid) {
        throw new Error('Dump capture could not start');
      }

      const lease: IDumpCaptureLease = { ...initial, childPid: worker.pid };

      await writeFile(path.join(stagingRoot, '.lease.json'), JSON.stringify(lease), { mode: 0o600 });
      await assertCaptureLease(root, lease);
      const start: IDumpCaptureStart = {
        kind: CaptureMessageKind.Start,
        lease,
        stagingRoot,
        storage: this.settings.storage,
        database: this.settings.database,
        addonMetadata: this.settings.addonMetadata(),
        ...(options ? { options } : {}),
      };

      if (Buffer.byteLength(JSON.stringify(start)) > 2097152) {
        throw new Error('Dump job metadata exceeds its limit');
      }
      signal.throwIfAborted();
      worker.send(start, (error) => {
        if (error) {
          complete({ kind: CaptureMessageKind.Failure });
        }
      });
      const message = await completion;

      signal.throwIfAborted();

      if (message.kind !== CaptureMessageKind.Result) {
        const code = Object.values(BusinessErrorCode).find((candidate) => candidate === message.code);

        if (code) {
          throw new BusinessError(code, 'Dump capture failed');
        }
        throw new Error('Dump capture failed');
      }

      const exit = await exited;

      signal.throwIfAborted();

      if (exit.failed || exit.code !== 0) {
        throw new Error('Dump capture exited unsuccessfully');
      }
      await assertCaptureLease(root, lease);
      const result = readCompletedDump(message.result, options?.type ?? SiteDumpType.Site);
      const archiveDirectory = result.type === SiteDumpType.Installation ? installationArchiveDirectory : siteId;
      const from = await checked(stagingRoot, archiveDirectory + '/' + result.filename);
      const info = await lstat(from);

      if (!info.isFile() || info.isSymbolicLink() || info.size !== result.byteSize) {
        throw new Error('Invalid completed dump file');
      }

      const directory = child(root, archiveDirectory);

      await mkdir(directory, { recursive: true, mode: 0o700 });

      if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) {
        throw new Error('Invalid dump destination');
      }

      const destination = child(directory, result.filename);
      const prior = await lstat(destination).catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return null;
      });

      if (prior) {
        throw new Error('Completed dump already exists');
      }
      await rename(from, destination);

      return result;
    } finally {
      if (abort) {
        signal.removeEventListener('abort', abort);
      }
      if (spawned?.pid && spawned.exitCode === null && spawned.signalCode === null) {
        spawned.kill('SIGKILL');
      }
      if (exited) {
        await exited;
      }
      this.child = null;

      if (created) {
        await removeCaptureJob(root, jobId);
      }
    }
  }

  snapshot(): { active: boolean; pid: number | null } {
    return { active: this.current !== null, pid: this.child?.pid ?? null };
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    this.cancellation?.abort();

    if (this.current) {
      await Promise.allSettled([this.current]);
    }
  }
}
