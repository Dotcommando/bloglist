import { createServer } from 'node:http';

import { expect, it } from 'vitest';

import { ProcessCalibrationLoad } from
  '../../src/adapters/outbound/runtime/calibration/calibration-load.adapter.js';

it('measures real HTTP traffic independently with persistent connections and normalized zero-safe shares', async () => {
  const counts = new Map<string, number>();
  const connections = new Set<number>();
  const server = createServer((request, response) => {
    counts.set(request.url!, (counts.get(request.url!) ?? 0) + 1);
    connections.add(request.socket.remotePort!);
    response.end('Synthetic page');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing generator test listener');
  }

  try {
    const load = new ProcessCalibrationLoad(() => 'http://127.0.0.1:' + address.port);
    const result = await load.measure({
      concurrency: 2,
      warmupSeconds: 1,
      seconds: 1,
      targets: [
        {
          siteId: 'one',
          authority: 'one.test',
          path: '/',
          share: 3000,
          effectiveShare: 60,
          releaseId: 'v1',
          apiSteps: [{ addonKey: 'fixture', queryId: 'list', path: '/api/fixture/list' }],
        },
        { siteId: 'one', authority: 'one.test', path: '/other/', share: 2000, effectiveShare: 40, releaseId: 'v1' },
        { siteId: 'one', authority: 'one.test', path: '/zero/', share: 0, effectiveShare: 0, releaseId: 'v1' },
      ],
    }, new AbortController().signal);

    expect(result.metrics.requests).toBeGreaterThan(100);
    expect(result.metrics.errors).toBe(0);
    expect(result.metrics.p99Ms).toBeGreaterThan(0);
    expect(connections.size).toBeLessThanOrEqual(2);
    expect(counts.has('/zero/')).toBe(false);
    expect(counts.get('/api/fixture/list')).toBe(counts.get('/'));
    expect(counts.get('/')! / (counts.get('/')! + counts.get('/other/')!)).toBeCloseTo(0.6, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 15000);

it('cancels and reaps the child before returning cancellation', async () => {
  const abort = new AbortController();
  const load = new ProcessCalibrationLoad(() => 'http://127.0.0.1:1');
  const result = load.measure({
    concurrency: 1,
    seconds: 100,
    warmupSeconds: 1,
    targets: [{ siteId: 'one', authority: 'one.test', path: '/', share: 10000, effectiveShare: 100, releaseId: 'v1' }],
  },
  abort.signal);
  const assertion = expect(result).rejects.toBeDefined();

  abort.abort(new Error('Synthetic cancellation'));
  await assertion;
});
