import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ProcessDumpCaptureAdapter } from '../../src/adapters/outbound/backup/process/dump-capture.adapter.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';

async function setup(
  timeoutMs = 3000, missingRunner = false,
): Promise<{ root: string; capture: ProcessDumpCaptureAdapter }> {
  const root = await mkdtemp(path.resolve('.tmp/dump-process-'));

  await mkdir(path.join(root, 'dumps/.coordination'), { recursive: true });
  await writeFile(path.join(root, 'dumps/.coordination/.operation.lock'), String(process.pid));
  const capture = new ProcessDumpCaptureAdapter({
    runner: new URL(
      missingRunner ? '../fixtures/absent-process.mjs' : '../fixtures/dump-capture-runner.mjs', import.meta.url,
    ),
    storage: {
      root: path.join(root, 'dumps'),
      sourcesRoot: path.join(root, 'sources'),
      artifactsRoot: path.join(root, 'artifacts'),
    },
    mongoUri: 'mongodb://localhost:27017',
    database: 'not_connected_by_fixture',
    addonMetadata: () => ({ cmsVersion: '0.12.0', registrations: [], staticOwned: [] }),
    timeoutMs,
  });

  return { root, capture };
}

it('rejects a linked staging root before creating a job outside private staging', async () => {
  const { root, capture } = await setup();
  const external = path.join(root, 'external');

  try {
    await mkdir(external);
    await symlink(external, path.join(root, 'dumps/.capture-jobs'), 'junction');
    await expect(capture.capture('s')).rejects.toThrow();
    expect(await readdir(external)).toEqual([]);
  } finally {
    await capture.onModuleDestroy();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

it.each(['timeout', 'startup', 'shutdown'])('cleans staging after %s failure', async (mode) => {
  const { root, capture } = await setup(mode === 'timeout' ? 100 : 3000, mode === 'startup');

  try {
    const canceled = new AbortController();

    canceled.abort();
    await expect(capture.capture('s', undefined, canceled.signal)).rejects.toThrow();
    expect(capture.snapshot().active).toBe(false);
    const result = Promise.allSettled([
      capture.capture('s', { type: SiteDumpType.Snippets, itemIds: ['hold'] }),
    ]);

    if (mode === 'shutdown') {
      await vi.waitFor(() => expect(capture.snapshot().pid).not.toBeNull());
      await capture.onModuleDestroy();
    }
    expect((await result)[0]).toMatchObject({ status: 'rejected' });
    expect(capture.snapshot()).toEqual({ active: false, pid: null });
    expect(await readdir(path.join(root, 'dumps/.capture-jobs'))).toEqual([]);
  } finally {
    await capture.onModuleDestroy();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

it('publishes only a completed child archive and cleans private staging', async () => {
  const { root, capture } = await setup();

  try {
    const result = await capture.capture('s');

    expect(result.type).toBe(SiteDumpType.Site);
    expect(await readFile(path.join(root, 'dumps/s', result.filename), 'utf8')).toBe('synthetic archive');
    expect(await readdir(path.join(root, 'dumps/.capture-jobs'))).toEqual([]);
    expect(capture.snapshot().active).toBe(false);
  } finally {
    await capture.onModuleDestroy();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

it('rejects crash, foreign output and concurrent admission, and reaps canceled capture before cleanup', async () => {
  const { root, capture } = await setup();

  try {
    await expect(capture.capture('s', { type: SiteDumpType.Snippets, itemIds: ['crash'] })).rejects.toThrow();
    await expect(capture.capture('s', { type: SiteDumpType.Snippets, itemIds: ['foreign'] })).rejects.toThrow();
    const cancellation = new AbortController();
    const active = Promise.allSettled([
      capture.capture('s', { type: SiteDumpType.Snippets, itemIds: ['hold'] }, cancellation.signal),
    ]);

    await expect(capture.capture('s')).rejects.toThrow();
    cancellation.abort();
    expect((await active)[0]).toMatchObject({ status: 'rejected' });
    expect(await readdir(path.join(root, 'dumps/.capture-jobs'))).toEqual([]);
  } finally {
    await capture.onModuleDestroy();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

it('lets the coordinator capture under a different live serving operation owner', async () => {
  const { root, capture } = await setup();

  try {
    await writeFile(path.join(root, 'dumps/.coordination/.operation.lock'), String(process.ppid));
    const result = await capture.captureForProcess(process.ppid, 's');

    expect(result.type).toBe(SiteDumpType.Site);
    expect(await readFile(path.join(root, 'dumps/s', result.filename), 'utf8')).toBe('synthetic archive');
    expect(await readdir(path.join(root, 'dumps/.capture-jobs'))).toEqual([]);
    await expect(capture.captureForProcess(process.pid, 's')).rejects.toThrow('lease');
  } finally {
    await capture.onModuleDestroy();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});
