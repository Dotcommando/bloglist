import { afterEach, expect, it, vi } from 'vitest';

import { CpuTelemetryService } from '../../src/app/services/resources/cpu-telemetry.service.js';
import type { ICpuLoadSample } from '../../src/ports/outbound/resources/cpu-counters.port.js';

afterEach(() => vi.useRealTimers());

it('shares sampling, starts with a baseline and discards state after the last subscriber leaves', async () => {
  vi.useFakeTimers();
  let total = 0;
  const read = vi.fn(async () => ({
    timestamp: new Date().toISOString(),
    monotonicMs: total += 1000,
    source: 'test',
    cores: [{ total, idle: total / 2 }],
  }));
  const samples: ICpuLoadSample[] = [];
  const subscriber = {
    authorize: async () => {},
    send: (sample: ICpuLoadSample) => {
      samples.push(sample);
    },
    close: vi.fn(),
  };
  const service = new CpuTelemetryService({ read });
  const stop = service.subscribe(subscriber);
  const second = service.subscribe({ ...subscriber, send: () => {} });

  await vi.advanceTimersByTimeAsync(0);
  expect(samples[0]?.usage).toEqual([null]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(samples.at(-1)?.usage).toEqual([50]);
  expect(read).toHaveBeenCalledTimes(2);
  stop();
  second();
  await vi.advanceTimersByTimeAsync(10000);
  expect(read).toHaveBeenCalledTimes(2);
  const third = service.subscribe(subscriber);

  await vi.advanceTimersByTimeAsync(0);
  expect(samples.at(-1)?.usage).toEqual([null]);
  third();
  expect(vi.getTimerCount()).toBe(0);
});

it('marks reset and changed topology intervals as gaps, then resumes from the new baseline', async () => {
  vi.useFakeTimers();
  let now = 0;
  let cores = [{ total: 100, idle: 100 }];
  const service = new CpuTelemetryService({
    read: async () => ({
      timestamp: new Date().toISOString(), monotonicMs: now += 1000, source: 'test', cores,
    }),
  });
  const samples: ICpuLoadSample[] = [];
  const stop = service.subscribe({
    authorize: async () => {},
    close: () => {},
    send: (sample) => {
      samples.push(sample);
    },
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    cores = [{ total: 1100, idle: 100 }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(samples.at(-1)?.usage).toEqual([100]);
    cores = [{ total: 1, idle: 1 }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(samples.at(-1)?.usage).toEqual([null]);
    cores = [{ total: 1001, idle: 1001 }, { total: 5000, idle: 3000 }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(samples.at(-1)?.usage).toEqual([null, null]);
    cores = [{ total: 2001, idle: 2001 }, { total: 6000, idle: 3500 }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(samples.at(-1)?.usage).toEqual([0, 50]);
  } finally {
    stop();
  }
});

it('removes expired sessions and marks lost intervals unavailable without fabricating zeros', async () => {
  vi.useFakeTimers();
  let total = 0;
  const read = vi.fn(async () => ({
    timestamp: new Date().toISOString(),
    monotonicMs: total += 1000,
    source: 'test',
    cores: [{ total, idle: total }],
  }));
  const send = vi.fn();
  const authorize = vi.fn(async () => {});
  const close = vi.fn();
  const service = new CpuTelemetryService({ read });
  const stop = service.subscribe({ authorize, send, close });

  await vi.advanceTimersByTimeAsync(0);
  read.mockRejectedValueOnce(new Error('missing source'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(send.mock.calls.at(-1)?.[0].usage).toEqual([null]);
  authorize.mockRejectedValueOnce(new Error('expired'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  stop();
});
