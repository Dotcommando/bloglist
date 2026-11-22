import { createServer, request } from 'node:http';

import { expect, it, vi } from 'vitest';

import {
  AdminCalibrationController,
} from '../../src/adapters/inbound/rest/calibration/admin-calibration.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { currentAdmin } from '../support/current-admin.js';

it.each(['anonymous', 'forged', 'site-admin', 'blocked'])('rejects %s before consuming protected calibration bodies',
  async kind => {
    const server = createServer();
    let consumed = 0;
    const operation = { execute: vi.fn(), detail: vi.fn() };

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing isolated calibration listener');
    }

    const origin = 'http://127.0.0.1:' + address.port;
    const current = {
      execute: async ({ token }: { token: string | null }) => {
        if (kind === 'anonymous' || token !== 'valid') {
          throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Session required');
        }

        const profile = currentAdmin();

        return {
          ...profile,
          user: {
            ...profile.user,
            ...(kind === 'blocked' ? { blocked: true }
              : { authorization: { systemAdmin: false, siteIds: ['one'], siteAdminSiteIds: ['one'] } }),
          },
        };
      },
    };
    const controller = new AdminCalibrationController({ origin }, current, operation, operation, operation,
      operation, operation, { start: operation, read: operation, apply: operation, cancel: operation, full: false });

    server.on('request', (incoming, response) => {
      const iterator = incoming[Symbol.asyncIterator].bind(incoming);

      incoming[Symbol.asyncIterator] = () => {
        consumed++;

        return iterator();
      };
      void controller.handle(incoming, response).catch(error => response.destroy(error));
    });

    try {
      for (const [method, path] of [
        ['POST', '/profiles'], ['PUT', '/profiles/profile'], ['DELETE', '/profiles/profile'],
        ['POST', '/runs'], ['POST', '/runs/run/apply'], ['POST', '/runs/run/cancel'],
        ['GET', '/profiles'], ['GET', '/runs'], ['GET', '/runs/run'], ['GET', '/capabilities'],
      ]) {
        const status = await new Promise<number>((resolve, reject) => {
          const outgoing = request(origin + '/api/admin/installation/calibration' + path, {
            method,
            headers: {
              Origin: origin,
              'X-Zarya-Admin': '1',
              'Content-Type': 'application/json',
              'Content-Length': '1073741824',
              Cookie: 'zarya_admin_session=' + (kind === 'forged' ? 'forged' : 'valid'),
            },
          }, response => {
            response.resume();
            response.on('end', () => {
              resolve(response.statusCode!);
              outgoing.destroy();
            });
            response.on('error', reject);
          });

          outgoing.on('error', reject);
          outgoing.setTimeout(2000, () => outgoing.destroy(new Error('Authorization waited for body')));
          outgoing.flushHeaders();
        });

        expect(status).toBe(kind === 'anonymous' || kind === 'forged' ? 401 : 403);
      }
      expect(consumed).toBe(0);
      expect(operation.execute).not.toHaveBeenCalled();
      expect(operation.detail).not.toHaveBeenCalled();
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
