import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { PageResolutionController } from '../../src/adapters/inbound/rest/diagnostics/page-resolution.controller.js';
import { HttpFailure } from '../../src/adapters/inbound/rest/shared/admin-http.boundary.js';

describe('private statistics HTTP boundary', () => {
  function request(target: string): { request: IncomingMessage; response: ServerResponse; socket: Socket } {
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.url = target;
    request.method = 'GET';
    request.headers.host = 'localhost:31987';
    request.headers.origin = 'http://localhost:31987';
    request.headers['x-zarya-admin'] = '1';

    return { request, response: new ServerResponse(request), socket };
  }

  it('rejects an invalid session without reading an unfinished body or invoking the use case', async () => {
    const execute = vi.fn();
    const factory = {
      forSession: vi.fn(async () => {
        throw new HttpFailure(401, 'Unauthorized');
      }),
    };
    const controller = new PageResolutionController({ origin: 'http://localhost:31987' }, factory, {
      submit: vi.fn(), status: () => ({ dropped: 0, failed: 0, pending: 0 }),
    });
    const fixture = request('/api/admin/sites/site/page-resolutions');
    const read = vi.spyOn(fixture.request, 'read');

    fixture.request.method = 'POST';
    fixture.request.headers['content-length'] = '10000000';
    vi.spyOn(fixture.response, 'end').mockImplementation(() => fixture.response);

    try {
      await controller.handle(fixture.request, fixture.response);
      expect(fixture.response.statusCode).toBe(401);
      expect(read).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    } finally {
      fixture.socket.destroy();
    }
  });

  it('rejects duplicate query fields before invoking the authorized operation', async () => {
    const execute = vi.fn();
    const controller = new PageResolutionController({ origin: 'http://localhost:31987' }, {
      forSession: async () => ({ execute }),
    }, { submit: vi.fn(), status: () => ({ dropped: 0, failed: 0, pending: 0 }) });
    const fixture = request('/api/admin/sites/site/page-resolutions?method=GET&method=HEAD');

    vi.spyOn(fixture.response, 'end').mockImplementation(() => fixture.response);

    try {
      await controller.handle(fixture.request, fixture.response);
      expect(fixture.response.statusCode).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      fixture.socket.destroy();
    }
  });
});
