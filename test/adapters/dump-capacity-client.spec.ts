import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { afterEach, expect, it, vi } from 'vitest';

import { ProcessDumpCapacityClient } from '../../src/adapters/outbound/runtime/processes/dump-capacity-client.js';

afterEach(() => vi.useRealTimers());

it('disconnects an uncertain reservation after its deadline and removes pending listeners', async () => {
  vi.useFakeTimers();
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((message: unknown) => message !== null),
    disconnect: vi.fn(),
  });
  const client = new ProcessDumpCapacityClient('site', channel);
  const assertion = expect(client.reserve('site')).rejects.toThrow('timed out');

  await vi.advanceTimersByTimeAsync(35000);
  await assertion;
  expect(channel.disconnect).toHaveBeenCalledTimes(1);
  expect(channel.listenerCount('message')).toBe(0);
  expect(channel.listenerCount('disconnect')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('observes supervisor loss during admission', async () => {
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((message: unknown) => message !== null),
    disconnect: vi.fn(),
  });
  const client = new ProcessDumpCapacityClient('site', channel);
  const assertion = expect(client.reserve('site')).rejects.toThrow('disconnected');

  channel.emit('disconnect');
  await assertion;
  expect(channel.listenerCount('message')).toBe(0);
});

it('cleans listeners when IPC throws before sending admission', async () => {
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn(() => {
      throw new Error('IPC send failed');
    }),
    disconnect: vi.fn(),
  });

  await expect(new ProcessDumpCapacityClient('site', channel).reserve('site')).rejects.toThrow('IPC send failed');
  expect(channel.listenerCount('message')).toBe(0);
  expect(channel.listenerCount('disconnect')).toBe(0);
  expect(channel.disconnect).toHaveBeenCalledTimes(1);
});

it('delegates capture metadata to the coordinator and waits for cancellation cleanup acknowledgement', async () => {
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((message: unknown) => message !== null),
    disconnect: vi.fn(),
  });
  const client = new ProcessDumpCapacityClient('site', channel);
  const cancellation = new AbortController();
  let settled = false;
  const result = client.capture('site', undefined, cancellation.signal).then(
    () => {
      settled = true;

      return null;
    },
    (error: unknown) => {
      settled = true;

      return error;
    },
  );
  const command: unknown = channel.send.mock.calls[0]?.[0];

  if (!command || typeof command !== 'object' || !('id' in command) || !('action' in command)) {
    throw new Error('Expected a capture command');
  }

  expect(command.action).toBe('capture');
  cancellation.abort();
  expect(channel.send).toHaveBeenLastCalledWith({ kind: 'capture-cancel', id: command.id }, expect.any(Function));
  await Promise.resolve();
  expect(settled).toBe(false);
  channel.emit('message', { kind: 'capacity-result', id: command.id, error: 'capture canceled after cleanup' });
  expect(await result).toBeInstanceOf(Error);
  expect(channel.listenerCount('message')).toBe(0);
  expect(channel.listenerCount('disconnect')).toBe(0);
});

it('validates completed metadata and rejects foreign or already canceled capture before sending', async () => {
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((message: unknown) => message !== null),
    disconnect: vi.fn(),
  });
  const client = new ProcessDumpCapacityClient('site', channel);
  const cancellation = new AbortController();

  cancellation.abort();
  await expect(client.capture('site', undefined, cancellation.signal)).rejects.toThrow();
  await expect(client.capture('other')).rejects.toThrow('Foreign site');
  expect(channel.send).not.toHaveBeenCalled();
  const captured = client.capture('site');
  const command: unknown = channel.send.mock.calls[0]?.[0];

  if (!command || typeof command !== 'object' || !('id' in command)) {
    throw new Error('Expected a capture command');
  }

  const createdAt = new Date();
  const filename = createdAt.toISOString().replace(/[:.]/g, '-') + '_' + randomUUID() + '.jsonl.gz';

  channel.emit('message', {
    kind: 'capacity-result',
    id: command.id,
    result: { type: 'Site', filename, byteSize: 100, createdAt },
  });
  expect(await captured).toMatchObject({ filename, byteSize: 100, createdAt });
  expect(channel.listenerCount('message')).toBe(0);
});
