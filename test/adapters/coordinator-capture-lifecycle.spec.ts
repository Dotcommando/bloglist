import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { recoverCaptureOperation } from '../../src/adapters/outbound/backup/files/dump-capture-lease.js';
import { SharedDumpMaintenance } from '../../src/adapters/outbound/backup/files/shared-dump-maintenance.js';
import { ProcessDumpCaptureAdapter } from '../../src/adapters/outbound/backup/process/dump-capture.adapter.js';
import { ProcessDumpCoordinator } from '../../src/adapters/outbound/runtime/processes/process-dump-coordinator.js';
import { DumpExecutionMode } from '../../src/domain/resources/site-process-allocation.js';

it('reaps the actual coordinator child and reopens writes after the serving requester dies', async () => {
  const root = await mkdtemp(path.resolve('.tmp/fork-lifecycle-'));
  const requester = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'ignore', windowsHide: true,
  });
  const exited = new Promise<void>((resolve, reject) => {
    requester.once('exit', () => resolve());
    requester.once('error', reject);
  });
  const channel = Object.assign(new EventEmitter(), {
    pid: requester.pid,
    connected: true,
    send: vi.fn((message: Record<string, unknown>, callback: (error: Error | null) => void) => {
      callback(null);

      return Boolean(message);
    }),
    kill: (signal: NodeJS.Signals) => requester.kill(signal),
  });
  // Observe the child lifetime immediately, including a failed spawn.
  const requesterDone = exited.then(() => {
    channel.connected = false;
    channel.emit('exit');
  }, (error: unknown) => {
    channel.connected = false;
    channel.emit('exit');
    throw error;
  });
  const observedRequester = requesterDone.then(() => null, (error: unknown) => error);
  const dumpsRoot = path.join(root, 'dumps');
  const maintenanceRoot = path.join(root, 'maintenance');
  const maintenance = new SharedDumpMaintenance(maintenanceRoot);
  const capture = new ProcessDumpCaptureAdapter({
    runner: new URL('../fixtures/dump-capture-runner.mjs', import.meta.url),
    storage: { root: dumpsRoot, sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts') },
    mongoUri: 'mongodb://localhost:27017',
    database: 'not_connected_by_fixture',
    addonMetadata: () => ({ cmsVersion: '0.14.0', registrations: [], staticOwned: [] }),
    timeoutMs: 5000,
  });
  const release = vi.fn(async () => {
    maintenance.enter()();
  });
  const coordinator = new ProcessDumpCoordinator({
    reserveForProcess: async () => ({ mode: DumpExecutionMode.BorrowedProcess, release }),
  }, (pid, siteId, options, signal) => capture.captureForProcess(pid, siteId, options, signal),
  (pid) => maintenance.recoverCaptureOwner(pid, () => recoverCaptureOperation(dumpsRoot, pid)));

  try {
    expect(requester.pid).toBeTypeOf('number');
    await mkdir(path.join(dumpsRoot, '.coordination'), { recursive: true });
    await writeFile(path.join(dumpsRoot, '.coordination/.operation.lock'), String(requester.pid));
    await writeFile(path.join(maintenanceRoot, 'state.json'), JSON.stringify({
      version: randomUUID(), owner: requester.pid, readable: true, failed: false,
    }));
    coordinator.attach('site', 'requester', channel);
    channel.emit('message', { kind: 'capacity', id: 'reserve', action: 'reserve' });
    await vi.waitFor(() => expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reserve', mode: 'BorrowedProcess' }), expect.any(Function),
    ));
    channel.emit('message', {
      kind: 'capacity', id: 'capture', action: 'capture', options: { type: 'Snippets', itemIds: ['hold'] },
    });
    await vi.waitFor(() => expect(capture.snapshot().pid).not.toBeNull());
    const capturePid = capture.snapshot().pid!;

    requester.kill('SIGKILL');
    expect(await observedRequester).toBeNull();
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(capture.snapshot()).toEqual({ active: false, pid: null });
    expect(() => process.kill(capturePid, 0)).toThrow();
    expect(await readdir(path.join(dumpsRoot, '.capture-jobs'))).toEqual([]);
    maintenance.enter()();
  } finally {
    requester.kill('SIGKILL');
    await observedRequester;
    await coordinator.close();
    await capture.onModuleDestroy();

    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  }
});
