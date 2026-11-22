import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocket, WebSocketServer } from 'ws';

import { requireInstallationAdministrator } from '../../../../domain/admin-users/admin-user.policy.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ICpuTelemetry } from '../../../../ports/inbound/resources/cpu-telemetry.port.js';
import { AdminHttpBoundary, type IAdminHttpSettings } from '../../rest/shared/admin-http.boundary.js';

export class AdminCpuTelemetryController {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  private pending = 0;

  constructor(private readonly telemetry: ICpuTelemetry, private readonly current: IGetCurrentAdminUser,
    private readonly settings: () => Promise<IAdminHttpSettings>) {}

  async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    socket.on('error', () => socket.destroy());

    if (this.pending >= 16 || request.url !== '/api/admin/installation/cpu' || request.method !== 'GET') {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');

      return;
    }
    this.pending++;

    try {
      const settings = await this.settings();
      const boundary = new AdminHttpBoundary(settings);

      // The existing boundary requires a ServerResponse only for headers; upgrade validation stays explicit here.
      if (
        request.headers.host !== new URL(settings.origin).host
        || request.headers.origin !== settings.origin
        || ['host', 'origin', 'cookie'].some((name) => request.rawHeaders.filter((value, index) =>
          index % 2 === 0 && value.toLowerCase() === name).length > 1)
      ) {
        throw new Error('Untrusted telemetry boundary');
      }

      const token = boundary.token(request);

      requireInstallationAdministrator((await this.current.execute({ token })).user);

      if (socket.destroyed) {
        return;
      }
      this.server.handleUpgrade(request, socket, head, (client) => {
        let lastPong = performance.now();
        let lastPing = lastPong;
        let stop: (() => void) | undefined;

        client.on('pong', () => {
          lastPong = performance.now();
        });
        client.on('error', () => client.terminate());
        client.on('message', () => client.close(1008, 'Read-only telemetry'));
        client.once('close', () => stop?.());

        try {
          stop = this.telemetry.subscribe({
            authorize: async () => {
              const actual = await this.settings();

              if (actual.origin !== settings.origin || actual.cookieVersion?.() !== settings.cookieVersion?.()) {
                throw new Error('Administration boundary changed');
              }
              requireInstallationAdministrator((await this.current.execute({ token })).user);
            },
            close: () => client.terminate(),
            send: (sample) => {
              const now = performance.now();
              const payload = JSON.stringify(sample);

              if (
                client.readyState !== WebSocket.OPEN
                || now - lastPong > 45000
                || client.bufferedAmount > 65536
                || Buffer.byteLength(payload) > 65536
              ) {
                client.terminate();
                stop?.();

                return;
              }
              if (now - lastPing >= 15000) {
                lastPing = now;
                client.ping(undefined, false, (error) => {
                  if (error) {
                    client.terminate();
                  }
                });
              }
              client.send(payload, (error) => {
                if (error) {
                  client.terminate();
                }
              });
            },
          });
        } catch {
          client.terminate();
        }
      });
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    } finally {
      this.pending--;
    }
  }

  close(): void {
    this.telemetry.close();
    this.server.close();
  }
}
