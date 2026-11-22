import { EventEmitter } from 'node:events';

import { expect, it, type Mock, vi } from 'vitest';

import { ProcessDumpCoordinator } from '../../src/adapters/outbound/runtime/processes/process-dump-coordinator.js';
import { type ISiteDump, type ISiteDumpCreation, SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import { DumpExecutionMode } from '../../src/domain/resources/site-process-allocation.js';
import type { IDumpCapacityLease } from '../../src/ports/outbound/resources/dump-capacity.port.js';

interface ITestFixture {
  readonly coordinator: ProcessDumpCoordinator;
  readonly worker: EventEmitter & {
    pid: number;
    connected: boolean;
    send: Mock<(message: Record<string, unknown>, callback: (error: Error | null) => void) => boolean>;
    kill: Mock<() => boolean>;
  };
  readonly capture: Mock<(owner: number, site: string, options: ISiteDumpCreation | undefined,
    signal: AbortSignal) => Promise<ISiteDump>>;
  readonly reserveForProcess: Mock<(siteId: string, owner: string) => Promise<IDumpCapacityLease>>;
  readonly release: Mock<() => Promise<void>>;
  request(id: string, action: string): Promise<void>;
}

function fixture(recoverRequester?: (ownerPid: number) => Promise<void>): ITestFixture {
  const release = vi.fn(async () => {});
  const reserveForProcess = vi.fn<(siteId: string, owner: string) => Promise<IDumpCapacityLease>>(async () => ({
    mode: DumpExecutionMode.BorrowedProcess,
    release,
  }));
  const capture = vi.fn<(owner: number, site: string, options: ISiteDumpCreation | undefined,
    signal: AbortSignal) => Promise<ISiteDump>>(async () => ({
    filename: 'test', type: SiteDumpType.Site, byteSize: 1, createdAt: new Date(0),
  }));
  const worker = Object.assign(new EventEmitter(), {
    pid: 123,
    connected: true,
    send: vi.fn((message: Record<string, unknown>, callback: (error: Error | null) => void) => {
      callback(null);

      return Boolean(message);
    }),
    kill: vi.fn(() => true),
  });
  const coordinator = new ProcessDumpCoordinator({ reserveForProcess }, capture, recoverRequester);

  coordinator.attach('site', 'worker', worker);
  const request = async (id: string, action: string): Promise<void> => {
    worker.emit('message', { kind: 'capacity', id, action });
    await vi.waitFor(() => expect(worker.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'capacity-result', id }), expect.any(Function),
    ));
  };

  return { coordinator, worker, capture, reserveForProcess, release, request };
}

it('captures in the coordinator for the trusted requester, with an admitted lease', async () => {
  const f = fixture();

  try {
    await f.request('not-admitted', 'capture');
    expect(f.capture).not.toHaveBeenCalled();
    await f.request('reserve', 'reserve');
    expect(f.reserveForProcess).toHaveBeenCalledWith('site', 'worker');
    await f.request('capture', 'capture');
    expect(f.capture).toHaveBeenCalledWith(123, 'site', undefined, expect.any(AbortSignal));
    await f.request('release', 'release');
    expect(f.release).toHaveBeenCalledOnce();
  } finally {
    await f.coordinator.close();
  }
});

it.each(['exit', 'disconnect'])('reaps capture before restoring capacity on requester %s', async (event) => {
  const f = fixture();
  let aborted!: () => void;
  const cancellation = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  let reaped!: () => void;
  const cleanup = new Promise<void>((resolve) => {
    reaped = resolve;
  });

  f.capture.mockImplementationOnce(async (...args) => {
    const signal = args[3];

    signal.addEventListener('abort', aborted, { once: true });
    await cancellation;
    await cleanup;
    throw new Error('capture canceled');
  });

  try {
    await f.request('reserve', 'reserve');
    f.worker.emit('message', { kind: 'capacity', id: 'capture', action: 'capture' });
    await vi.waitFor(() => expect(f.capture).toHaveBeenCalledOnce());
    f.worker.connected = false;
    f.worker.emit(event);
    await cancellation;
    expect(f.release).not.toHaveBeenCalled();
    reaped();
    await vi.waitFor(() => expect(f.release).toHaveBeenCalledOnce());
    expect(f.worker.kill).toHaveBeenCalledWith('SIGTERM');
  } finally {
    reaped();
    await f.coordinator.close();
  }
});

it('observes capture rejection and shutdown cancellation without releasing a running child', async () => {
  const f = fixture();

  await f.request('reserve', 'reserve');
  f.capture.mockRejectedValueOnce(new Error('capture failed'));
  await f.request('failed', 'capture');
  expect(f.worker.send).toHaveBeenCalledWith(expect.objectContaining({ id: 'failed', error: expect.any(String) }),
    expect.any(Function));
  f.capture.mockImplementationOnce(async (...args) => {
    const signal = args[3];

    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    expect(f.release).not.toHaveBeenCalled();
    throw new Error('shutdown');
  });
  f.worker.emit('message', { kind: 'capacity', id: 'active', action: 'capture' });
  await vi.waitFor(() => expect(f.capture).toHaveBeenCalledTimes(2));
  await f.coordinator.close();
  expect(f.release).toHaveBeenCalledOnce();
});

it('keeps release acknowledgements available while draining an active capture for shutdown', async () => {
  const f = fixture();

  try {
    await f.request('reserve', 'reserve');
    f.capture.mockImplementationOnce(async (...args) => {
      const signal = args[3];

      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      throw new Error('draining');
    });
    f.worker.emit('message', { kind: 'capacity', id: 'capture', action: 'capture' });
    await vi.waitFor(() => expect(f.capture).toHaveBeenCalledOnce());
    await f.coordinator.drain();
    expect(f.worker.send).toHaveBeenCalledWith(expect.objectContaining({ id: 'capture', error: expect.any(String) }),
      expect.any(Function));
    await f.request('release', 'release');
    expect(f.release).toHaveBeenCalledOnce();
    await f.request('new-reserve', 'reserve');
    expect(f.worker.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-reserve', error: expect.any(String) }),
      expect.any(Function));
  } finally {
    await f.coordinator.close();
  }
});

it('reconciles a requester that dies after capacity release but before its write gate is released', async () => {
  const recovery = vi.fn(async () => {});
  const f = fixture(recovery);

  try {
    await f.request('reserve', 'reserve');
    await f.request('capture', 'capture');
    await f.request('release', 'release');
    f.worker.connected = false;
    f.worker.emit('exit');
    await vi.waitFor(() => expect(recovery).toHaveBeenCalledWith(123));
    expect(f.release).toHaveBeenCalledOnce();
  } finally {
    await f.coordinator.close();
  }
});

it('force-terminates an IPC-disconnected requester before recovering its maintenance ownership', async () => {
  vi.useFakeTimers();
  const recovery = vi.fn(async () => {});
  const f = fixture(recovery);

  try {
    f.worker.connected = false;
    f.worker.emit('disconnect');
    expect(recovery).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.worker.kill).toHaveBeenCalledWith('SIGKILL');
    f.worker.emit('exit');
    await vi.advanceTimersByTimeAsync(0);
    expect(recovery).toHaveBeenCalledWith(123);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    f.worker.emit('exit');
    await f.coordinator.close();
    vi.useRealTimers();
  }
});
