import { setImmediate as nextTurn } from 'node:timers/promises';

import { DeferredResolutionSink } from '../../src/adapters/outbound/diagnostics/deferred-resolution-sink.adapter.js';
import {
  type IPageResolutionObservation, PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation,
} from '../../src/domain/diagnostics/page-resolution.js';

const record: IPageResolutionObservation = {
  siteId: 'site',
  path: '/',
  startedAt: new Date('2026-11-07T00:00Z'),
  durationMs: 1,
  completionMs: 2,
  method: ResolutionMethod.Get,
  representation: ResolutionRepresentation.Html,
  delivery: PageDelivery.Static,
  statusCode: 200,
  outcome: ResolutionOutcome.Success,
  stages: [],
  droppedStages: 0,
};

describe('deferred diagnostic sink', () => {
  it('defers writes, bounds admission and reports losses per site', async () => {
    let release = (): void => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => pending);
    const sink = new DeferredResolutionSink({ execute }, 1);

    sink.submit(record);
    expect(execute).not.toHaveBeenCalled();
    sink.submit(record);
    expect(sink.status('site')).toEqual({ dropped: 1, failed: 0, pending: 1 });
    expect(sink.status('other')).toEqual({ dropped: 0, failed: 0, pending: 0 });
    await nextTurn();
    expect(execute).toHaveBeenCalledOnce();
    release();
    await nextTurn();
    expect(sink.status('site').pending).toBe(0);
    await sink.onModuleDestroy();
  });

  it('counts a failed write without retrying or rejecting delivery', async () => {
    const execute = vi.fn(async () => {
      throw new Error('private storage failure');
    });
    const sink = new DeferredResolutionSink({ execute });

    sink.submit(record);
    await nextTurn();
    expect(execute).toHaveBeenCalledOnce();
    expect(sink.status('site')).toEqual({ dropped: 0, failed: 1, pending: 0 });
    await sink.onModuleDestroy();
  });
});
