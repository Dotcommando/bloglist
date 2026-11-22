import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { setImmediate as nextTurn } from 'node:timers/promises';

import {
  PageResolutionObserver,
} from '../../src/adapters/inbound/documents/http/publication/page-resolution-observer.js';
import {
  PublicDocumentController,
} from '../../src/adapters/inbound/documents/http/publication/public-document.controller.js';
import { RenderObservationAdapter } from '../../src/adapters/outbound/diagnostics/render-observation.adapter.js';
import { PublishedResolutionKind } from '../../src/domain/publication/published-resolution.js';
import { siteFixture } from '../support/sites.js';

describe('page timing at the HTTP boundary', () => {
  it.each(['cleanup-throw', 'cleanup-reject', 'submit-throw'])(
    'isolates %s after the response without an unhandled error',
    async (failure) => {
      vi.useFakeTimers({ toFake: ['setImmediate'] });
      const socket = new Socket();
      const request = new IncomingMessage(socket);
      const response = new ServerResponse(request);
      const end = vi.spyOn(response, 'end').mockImplementation(() => response);
      const observation = new RenderObservationAdapter();
      const cleanup = vi.spyOn(observation, 'waitForCompletion');
      const submit = vi.fn(() => {
        if (failure === 'submit-throw') {
          throw new Error('private logging failure');
        }
      });

      if (failure === 'cleanup-throw') {
        cleanup.mockImplementation(() => {
          throw new Error('private cleanup failure');
        });
      } else if (failure === 'cleanup-reject') {
        cleanup.mockRejectedValue(new Error('private cleanup failure'));
      }

      const observer = new PageResolutionObserver(observation, {
        submit,
        status: () => ({ failed: 0, dropped: 0, pending: 0 }),
      });

      request.method = 'GET';

      try {
        await observer.handle(request, response, async (context) => {
          context.siteId = 'site';
          context.path = '/page';
          response.statusCode = 200;
          response.end('Page');
        });
        response.emit('finish');
        expect(cleanup).not.toHaveBeenCalled();
        expect(submit).not.toHaveBeenCalled();
        await expect(vi.runAllTimersAsync()).resolves.toBe(vi);
        expect(response.statusCode).toBe(200);
        expect(end).toHaveBeenCalledExactlyOnceWith('Page', undefined, undefined);
        expect(response.listenerCount('finish')).toBe(0);
        expect(response.listenerCount('close')).toBe(0);
        expect(response.end).toBe(end);
        expect(submit).toHaveBeenCalledTimes(failure === 'submit-throw' ? 1 : 0);
      } finally {
        vi.useRealTimers();
        socket.destroy();
      }
    },
  );
  it('records an interrupted stream only after close and preserves the delivery error', async () => {
    let now = 0;
    const socket = new Socket();
    const request = new IncomingMessage(socket);
    const response = new ServerResponse(request);
    const write = vi.spyOn(response, 'write').mockReturnValue(false);
    const submit = vi.fn();
    const observer = new PageResolutionObserver(new RenderObservationAdapter(() => now), {
      submit,
      status: () => ({ failed: 0, dropped: 0, pending: 0 }),
    }, () => now);
    const failure = new Error('delivery failed');

    request.method = 'GET';

    try {
      const handled = observer.handle(request, response, async (context) => {
        context.siteId = 'site';
        context.path = '/page';
        now = 7;
        response.write('partial');
        throw failure;
      });

      await expect(handled).rejects.toBe(failure);
      await nextTurn();
      expect(submit).not.toHaveBeenCalled();
      now = 20;
      response.emit('close');
      expect(submit).not.toHaveBeenCalled();
      await nextTurn();
      expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        durationMs: 7,
        completionMs: 20,
        outcome: 'Aborted',
      }));
      expect(response.write).toBe(write);
      expect(response.listenerCount('finish')).toBe(0);
      expect(response.listenerCount('close')).toBe(0);
    } finally {
      socket.destroy();
    }
  });

  it('records ready time only after finish and excludes query values and logging time', async () => {
    let now = 0;
    const submit = vi.fn(() => {
      now += 1000;
    });
    const observation = new RenderObservationAdapter(() => now);
    const observer = new PageResolutionObserver(observation,
      {
        submit,
        status: () =>
          ({
            failed: 0,
            dropped: 0,
            pending: 0,
          }),
      },
      () =>
        now);
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.method = 'GET';
    request.url = '/page?private=value';
    request.headers.host = 'example.test';
    const response = new ServerResponse(request);

    vi.spyOn(response, 'end').mockImplementation(() => response);
    const controller = new PublicDocumentController({ execute: async () => siteFixture() }, {
      execute: async () =>
        ({
          kind: PublishedResolutionKind.RequestPlan,
          releaseId: 'r',
          renderPlanId: 'p',
          robotsIndex: true,
        }),
    }, {
      execute: async () => {
        now = 15;

        return { html: '<h1>Page</h1>', releaseId: 'r', pageId: 'p', inlineStyleHashes: [] };
      },
    }, { execute: vi.fn() }, observer, observation);

    try {
      observer.arrive(request);
      now = 5;
      await controller.handle(request, response);
      expect(submit).not.toHaveBeenCalled();
      now = 20;
      response.emit('finish');
      expect(submit).not.toHaveBeenCalled();
      await nextTurn();
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({
        path: '/page',
        durationMs: 15,
        completionMs: 20,
        delivery: 'Dynamic',
        outcome: 'Success',
      }));
      expect(JSON.stringify(submit.mock.calls)).not.toContain('private');
      response.emit('close');
      await nextTurn();
      expect(submit).toHaveBeenCalledOnce();
    } finally {
      socket.destroy();
    }
  });
});
