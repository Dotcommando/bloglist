import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { AdminDeploymentController } from '../../src/adapters/inbound/rest/deployment/admin-deployment.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';

describe('deployment administration HTTP boundary', () => {
  const current = { execute: vi.fn() };
  const status = { execute: vi.fn() };
  const configure = { execute: vi.fn() };
  const retry = { execute: vi.fn() };
  const check = { execute: vi.fn() };
  const factory = { forSession: vi.fn(() => configure) };
  const controller = (): AdminDeploymentController => new AdminDeploymentController(
    { origin: 'http://localhost' }, current, status, factory, retry, check);

  function response(): ServerResponse {
    const result = new ServerResponse(new IncomingMessage(new Socket()));

    vi.spyOn(result, 'end').mockImplementation(() => result);

    return result;
  }

  function request(action = '', body: unknown = {}, method = 'POST', complete = true): IncomingMessage {
    const value = new IncomingMessage(new Socket());

    if (complete) {
      value.push(Buffer.from(JSON.stringify(body)));
      value.push(null);
    }

    value.method = method;
    value.url = '/api/admin/sites/site-a/deployment' + action;
    value.headers = {
      host: 'localhost',
      origin: 'http://localhost',
      'x-zarya-admin': '1',
      'content-type': 'application/json',
      cookie: 'zarya_admin_session=session',
    };
    value.rawHeaders = [];

    return value;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    current.execute.mockResolvedValue({ user: { adminUserId: 'administrator' } });
    status.execute.mockResolvedValue({ state: 'Idle' });
    configure.execute.mockResolvedValue({ targetId: 'target-a' });
    check.execute.mockResolvedValue([]);
  });

  it('routes status, configuration, retry and diagnostics using the authenticated actor', async () => {
    const handler = controller();

    await handler.handle(request('', {}, 'GET'), response());
    expect(status.execute).toHaveBeenCalledWith({ siteId: 'site-a', actorId: 'administrator' });
    const body = {
      expectedVersion: null,
      enabled: true,
      providerKey: 'cloudflare',
      destinationName: 'worker',
      publicOrigin: 'https://public.test',
      backendOrigin: 'https://backend.test',
    };

    await handler.handle(request('', body), response());
    expect(configure.execute).toHaveBeenCalledWith({ ...body, siteId: 'site-a', actorId: 'administrator' });
    expect(factory.forSession).toHaveBeenCalledWith('session');
    await handler.handle(request('/retry', { expectedVersion: 'version' }), response());
    expect(retry.execute).toHaveBeenCalledWith({
      siteId: 'site-a', actorId: 'administrator', expectedVersion: 'version',
    });
    await handler.handle(request('/check'), response());
    expect(check.execute).toHaveBeenCalledWith({ siteId: 'site-a', actorId: 'administrator' });
  });

  it('rejects an unfinished oversized unauthenticated request before reading its body', async () => {
    current.execute.mockRejectedValueOnce(
      new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Login required'));
    const value = request('', {}, 'POST', false);
    const iterator = vi.spyOn(value, Symbol.asyncIterator);
    const result = response();

    value.headers['content-length'] = '999999999';
    await controller().handle(value, result);
    expect(result.statusCode).toBe(401);
    expect(iterator).not.toHaveBeenCalled();
    expect(configure.execute).not.toHaveBeenCalled();
  });

  it.each([{ actorId: 'forged' }, { expectedVersion: 3 }, { enabled: 'true' }])(
    'rejects malformed or untrusted fields', async (body) => {
      const result = response();

      await controller().handle(request('', body), result);
      expect(result.statusCode).toBe(400);
      expect(configure.execute).not.toHaveBeenCalled();
    });
});
