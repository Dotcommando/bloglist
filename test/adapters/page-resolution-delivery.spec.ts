import { createServer, get, type IncomingMessage } from 'node:http';
import { setImmediate as nextTurn } from 'node:timers/promises';

import {
  PageResolutionObserver,
} from '../../src/adapters/inbound/documents/http/publication/page-resolution-observer.js';
import { DeferredResolutionSink } from '../../src/adapters/outbound/diagnostics/deferred-resolution-sink.adapter.js';
import { RenderObservationAdapter } from '../../src/adapters/outbound/diagnostics/render-observation.adapter.js';
import { RecordPageResolutionUseCase } from '../../src/app/use-cases/diagnostics/record-page-resolution.use-case.js';
import { type IPageResolutionRecord, PageDelivery } from '../../src/domain/diagnostics/page-resolution.js';

function gate(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

describe('diagnostics isolation over real streaming HTTP', () => {
  it.each(['pending', 'throw', 'reject'])('delivers the complete page independently of a %s write', async (failure) => {
    let now = 0;
    let finished = false;
    const finishBody = gate();
    const handlerCleanup = gate();
    const loggingStarted = gate();
    const storage = gate();
    const events: string[] = [];
    const records: IPageResolutionRecord[] = [];
    const applicationErrors: unknown[] = [];
    const append = vi.fn((record: IPageResolutionRecord): Promise<void> => {
      records.push(record);
      events.push('append');
      expect(finished).toBe(true);
      now += 1000;
      loggingStarted.resolve();

      if (failure === 'throw') {
        throw new Error('private storage failure');
      }

      return failure === 'reject' ? Promise.reject(new Error('private storage failure')) : storage.promise;
    });
    const sink = new DeferredResolutionSink(new RecordPageResolutionUseCase({ append }, '0.10.1'));
    const observer = new PageResolutionObserver(new RenderObservationAdapter(() => now), sink, () => now);
    const server = createServer((request, response) => {
      observer.arrive(request);
      response.once('finish', () => {
        finished = true;
        events.push('finish');
      });
      void observer.handle(request, response, async (context) => {
        context.siteId = 'site';
        context.path = '/page';
        context.delivery = PageDelivery.Static;
        response.setHeader('Content-Type', 'text/html');
        now = 12;
        response.write('<h1>');
        await finishBody.promise;
        now = 35;
        response.end('Page</h1>');
        await handlerCleanup.promise;
      }).catch((error: unknown) => {
        applicationErrors.push(error);
        response.destroy();
      });
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Missing test listener');
      }

      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        get(`http://127.0.0.1:${address.port}/page?private=value`, resolve).once('error', reject);
      });
      const received = (async (): Promise<string> => {
        let body = '';

        for await (const chunk of response) {
          body += String(chunk);
        }

        return body;
      })();

      expect(append).not.toHaveBeenCalled();
      expect(finished).toBe(false);
      finishBody.resolve();
      expect(await received).toBe('<h1>Page</h1>');
      expect(response.statusCode).toBe(200);
      expect(finished).toBe(true);
      expect(append).not.toHaveBeenCalled();
      handlerCleanup.resolve();
      await loggingStarted.promise;
      expect(records).toEqual([expect.objectContaining({
        path: '/page',
        durationMs: 12,
        completionMs: 35,
        cmsVersion: '0.10.1',
      })]);
      expect(events).toEqual(['finish', 'append']);
      expect(JSON.stringify(records)).not.toContain('private');
      await nextTurn();
      expect(sink.status('site')).toEqual({
        pending: failure === 'pending' ? 1 : 0,
        failed: failure === 'pending' ? 0 : 1,
        dropped: 0,
      });
      expect(applicationErrors).toEqual([]);
      storage.resolve();
      await nextTurn();
      expect(append).toHaveBeenCalledOnce();
    } finally {
      finishBody.resolve();
      handlerCleanup.resolve();
      storage.resolve();
      await sink.onModuleDestroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
