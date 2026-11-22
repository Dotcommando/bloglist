import { afterEach, expect, it, vi } from 'vitest';

import { installationResources } from '../../admin/src/features/resources/resources-api.js';
import { ContentRequestError } from '../../admin/src/shared/api/content-api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(['headers', 'body'])('bounds resource %s reads and observes late rejection', async (stage) => {
  vi.useFakeTimers();
  let fail!: (error: Error) => void;
  let signal: AbortSignal | null | undefined;
  const body = new ReadableStream({
    start: (controller) => {
      fail = (error) => controller.error(error);
    },
  });

  vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
    signal = options.signal;

    if (stage === 'headers') {
      return new Promise<Response>((_resolve, reject) => {
        fail = reject;
      });
    }

    return Promise.resolve(new Response(body));
  }));
  let failure: unknown;
  const request = installationResources().then(() => null, (error: unknown) => {
    failure = error;
  });

  try {
    await vi.advanceTimersByTimeAsync(10000);
    expect(failure).toMatchObject({ name: 'TimeoutError' });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    fail(new Error('late transport failure'));
    await request;
  }
});

it('ends an uncertain allocation after its deadline instead of waiting forever for transport', async () => {
  vi.useFakeTimers();
  let fail!: (error: Error) => void;

  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => {
    fail = reject;
  })));
  let failure: unknown;
  const request = installationResources({
    expectedVersion: 'v1', databaseCpu: 2, sites: [{ siteId: 'a', processes: 10 }],
  }).then(() => null, (error: unknown) => {
    failure = error;
  });

  try {
    await vi.advanceTimersByTimeAsync(120000);
    expect(failure).toMatchObject({ name: 'TimeoutError' });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    fail(new Error('late allocation response failure'));
    await request;
  }
});

it.each([401, 409, 500])('preserves HTTP %s and releases its deadline', async (status) => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
  await expect(installationResources()).rejects.toBeInstanceOf(ContentRequestError);
  expect(vi.getTimerCount()).toBe(0);
});
