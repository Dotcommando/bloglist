import { lstat, readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

import { checked, child, missing } from './dump-files.js';

export interface IDumpCaptureLease {
  readonly jobId: string;
  readonly siteId: string;
  readonly parentPid: number;
  readonly operationOwnerPid?: number;
  readonly childPid: number | null;
}

export function captureJobRoot(root: string, jobId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(jobId)) {
    throw new Error('Invalid capture job identity');
  }

  return child(path.resolve(root), '.capture-jobs/' + jobId);
}

export function captureProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) {
    throw new Error('Invalid capture process identity');
  }

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

async function readLease(root: string, jobId: string): Promise<IDumpCaptureLease> {
  const directory = captureJobRoot(root, jobId);

  if (
    (await lstat(path.dirname(directory))).isSymbolicLink()
    || (await lstat(directory)).isSymbolicLink()
  ) {
    throw new Error('Linked capture directory');
  }

  const filename = path.join(directory, '.lease.json');
  const info = await lstat(filename);

  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) {
    throw new Error('Invalid capture lease file');
  }

  const raw: unknown = JSON.parse(await readFile(filename, 'utf8'));

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid capture lease');
  }

  const lease: Record<string, unknown> = Object.fromEntries(Object.entries(raw));

  if (
    lease.jobId !== jobId
    || typeof lease.siteId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(lease.siteId)
    || typeof lease.parentPid !== 'number'
    || !Number.isSafeInteger(lease.parentPid)
    || lease.parentPid < 1
    || lease.operationOwnerPid !== undefined
    && (typeof lease.operationOwnerPid !== 'number'
    || !Number.isSafeInteger(lease.operationOwnerPid)
    || lease.operationOwnerPid < 1)
    || lease.childPid !== null
    && (typeof lease.childPid !== 'number'
      || !Number.isSafeInteger(lease.childPid)
    || lease.childPid < 1)
  ) {
    throw new Error('Invalid capture lease');
  }

  return {
    jobId,
    siteId: lease.siteId,
    parentPid: lease.parentPid,
    childPid: lease.childPid,
    ...(typeof lease.operationOwnerPid === 'number' ? { operationOwnerPid: lease.operationOwnerPid } : {}),
  };
}

export async function assertCaptureLease(root: string, expected: IDumpCaptureLease): Promise<void> {
  const lease = await readLease(root, expected.jobId);
  const lock = await readFile(child(path.resolve(root), '.coordination/.operation.lock'), 'utf8');

  if (
    lease.siteId !== expected.siteId
    || lease.parentPid !== expected.parentPid
    || lease.childPid !== expected.childPid
    || (lease.operationOwnerPid ?? lease.parentPid) !== (expected.operationOwnerPid ?? expected.parentPid)
    || lock !== String(expected.operationOwnerPid ?? expected.parentPid)
    || !captureProcessAlive(expected.operationOwnerPid ?? expected.parentPid)
    || !captureProcessAlive(lease.parentPid)
  ) {
    throw new Error('Capture lease ownership changed');
  }
}

export async function removeCaptureJob(root: string, jobId: string): Promise<void> {
  const target = captureJobRoot(root, jobId);
  const canonicalRoot = await realpath(path.resolve(root));
  const canonical = await realpath(target);

  if (
    (await lstat(path.dirname(target))).isSymbolicLink()
    || (await lstat(target)).isSymbolicLink()
    || !canonical.startsWith(canonicalRoot + path.sep)
  ) {
    throw new Error('Capture cleanup escapes private storage');
  }
  await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 });
}

export async function recoverCaptureJobs(root: string): Promise<void> {
  const directory = child(path.resolve(root), '.capture-jobs');
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (!missing(error)) {
      throw error;
    }

    return [];
  });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('Invalid capture staging directory');
    }

    const lease = await readLease(root, entry.name);

    if (captureProcessAlive(lease.parentPid) || lease.childPid !== null && captureProcessAlive(lease.childPid)) {
      throw new Error('Dump capture process is active');
    }
    await removeCaptureJob(root, lease.jobId);
  }
}

export async function recoverCaptureOperation(root: string, ownerPid: number): Promise<void> {
  if (captureProcessAlive(ownerPid)) {
    throw new Error('A live capture owner cannot be recovered');
  }

  const journal = await lstat(child(path.resolve(root), '.restore-journal.json')).catch((error: unknown) => {
    if (!missing(error)) {
      throw error;
    }

    return null;
  });

  if (journal) {
    throw new Error('Interrupted restore requires installation recovery');
  }
  await recoverCaptureJobs(root);
  const lockPath = await checked(root, '.coordination/.operation.lock');
  const owner = await readFile(lockPath, 'utf8').catch((error: unknown) => {
    if (!missing(error)) {
      throw error;
    }

    return null;
  });

  if (owner !== null && owner !== String(ownerPid)) {
    throw new Error('Capture operation ownership changed');
  }
  if (owner !== null) {
    await rm(lockPath);
  }
}
