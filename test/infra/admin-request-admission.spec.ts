import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { NestFactory } from '@nestjs/core';

import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { GET_CURRENT_ADMIN_USER } from '../../src/infra/admin-auth/admin-auth.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';

describe('administrative request admission', () => {
  it.each([
    '/api/admin/users',
    '/api/admin/users/user/password',
    '/api/admin/users/user/block',
    '/api/admin/users/user/delete',
    '/api/admin/sites',
    '/api/admin/sites/site/pages',
    '/api/admin/sites/site/templates',
    '/api/admin/sites/site/chunks',
    '/api/admin/sites/site/snippets',
    '/api/admin/sites/site/template-variables',
    '/api/admin/sites/site/files',
    '/api/admin/sites/site/files/file/change',
    '/api/admin/sites/site/urls/virtual',
    '/api/admin/sites/site/publish',
    '/api/admin/auth/sessions/session/revoke',
  ])('rejects an unauthenticated oversized upload before a handler or body read: %s', async (url) => {
    let dispatch: ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>) | undefined;
    let reads = 0;
    const handle = vi.fn(async (request: IncomingMessage, response: ServerResponse) => {
      for await (const chunk of request) {
        reads += chunk.length > 0 ? 1 : 0;
      }
      response.end();
    });
    const current = {
      execute: vi.fn(async () => {
        throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Authentication required');
      }),
    };
    const app = {
      get: (token: unknown) => token === GET_CURRENT_ADMIN_USER ? current : {
        canHandle: () => true,
        handle,
        handler: () => null,
        actionRoute: () => undefined,
        legacyAdminHandler: () => null,
        enter: () => () => {},
        initialize: async () => {},
        read: async () => ({ adminOrigin: 'http://localhost', previousOrigin: null, version: 'v1' }),
      },
      use: (handler: typeof dispatch) => {
        dispatch = handler;
      },
      listen: async () => {},
      close: async () => {},
    };
    const create = vi.spyOn(NestFactory, 'create').mockImplementation(vi.fn().mockResolvedValue(app));
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.url = url;
    request.method = 'POST';
    request.headers = {
      host: 'localhost',
      origin: 'http://localhost',
      'x-zarya-admin': '1',
      'content-type': 'application/json',
      'content-length': '89494872',
    };
    request.rawHeaders = Object.entries(request.headers).flatMap(([key, value]) => [key, String(value)]);
    request[Symbol.asyncIterator] = async function* () {
      reads++;
      yield Buffer.alloc(64 * 1024);

      return undefined;
    };
    const response = new ServerResponse(request);
    let ended!: () => void;
    const finished = new Promise<void>((resolve) => {
      ended = resolve;
    });
    const end = vi.spyOn(response, 'end').mockImplementation(() => {
      ended();

      return response;
    });

    try {
      await createPublicHttpApplication({
        mongoUri: 'mongodb://localhost:27017',
        database: 'synthetic',
        artifactsRoot: '.tmp/admission-artifacts',
        sourcesRoot: '.tmp/admission-sources',
        host: '127.0.0.1',
        port: 0,
        pageDiagnostics: false,
        adminAuth: { origin: 'http://localhost' },
        media: { root: '.tmp/admission-media', publicBaseUrl: '/assets' },
      });
      await dispatch!(request, response);
      await finished;
      expect(response.statusCode).toBe(401);
      expect(reads).toBe(0);
      expect(handle).not.toHaveBeenCalled();
      expect(current.execute).toHaveBeenCalledWith({ token: null });
    } finally {
      end.mockRestore();
      create.mockRestore();
      socket.destroy();
    }
  });
});
