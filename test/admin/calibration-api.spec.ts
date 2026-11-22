import { afterEach, expect, it, vi } from 'vitest';

import { calibrationRequest } from '../../admin/src/features/calibration/calibration-api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(['GET', 'POST'])('bounds %s despite ignored abort and observes late rejections', async method => {
  vi.useFakeTimers();
  let rejectTransport: (error: Error) => void = () => {};
  const transport = new Promise<Response>((_resolve, reject) => {
    rejectTransport = reject;
  });
  const fetch = vi.fn(async () => transport);

  vi.stubGlobal('fetch', fetch);
  const request = calibrationRequest('/profiles', method, method === 'POST' ? {} : undefined);
  const assertion = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });

  await vi.advanceTimersByTimeAsync(method === 'GET' ? 10000 : 120000);
  await assertion;
  rejectTransport(new Error('Synthetic late transport failure'));
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
