import { createServer, type Server } from 'node:http';
import { isIP } from 'node:net';

import type { ISiteState } from '../../../../domain/sites/site.js';
import { SiteOriginMode } from '../../../../domain/sites/site-origin-mode.enum.js';
import { SiteStatus } from '../../../../domain/sites/site-status.enum.js';
import { LocalSiteListenerError } from './local-site-listener.error.js';

export interface ILocalSiteListeners {
  readonly origins: readonly string[];
  beginShutdown(): void;
  close(): Promise<void>;
}

interface ILocalEndpoint {
  readonly host: string;
  readonly port: number;
  readonly authorities: Set<string>;
  readonly origin: string;
}

export async function startLocalSiteListeners(
  gateway: Server, sites: readonly Pick<ISiteState, 'status' | 'addresses'>[],
): Promise<ILocalSiteListeners> {
  const primary = gateway.address();

  if (!primary || typeof primary === 'string') {
    throw new Error('The primary HTTP socket is not listening');
  }

  const endpoints = new Map<string, ILocalEndpoint>();
  const origins = new Set<string>();

  for (const site of sites) {
    const addresses = site.addresses;

    if (site.status !== SiteStatus.ACTIVE || addresses?.originMode !== SiteOriginMode.Local || !addresses.localOrigin) {
      continue;
    }

    const url = new URL(addresses.localOrigin);
    const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, '');

    if (url.protocol !== 'http:' || !(host === '::1' || isIP(host) === 4 && host.startsWith('127.'))) {
      continue;
    }

    const port = Number(url.port || 80);

    origins.add(url.origin);

    if (
      port === primary.port
      && (primary.address === host
      || primary.address === '::'
      || primary.address === '0.0.0.0'
      && isIP(host) === 4)
    ) {
      continue;
    }

    const key = host + ':' + port;
    const endpoint = endpoints.get(key) ?? { host, port, authorities: new Set<string>(), origin: url.origin };

    endpoint.authorities.add(url.host.toLowerCase());
    endpoints.set(key, endpoint);
  }

  const servers: Server[] = [];
  let shutdown: Promise<PromiseSettledResult<void>[]> | undefined;
  const beginShutdown = (): void => {
    shutdown ??= Promise.allSettled(servers.map(server => new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();

        return;
      }
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    })));
  };
  const close = async (): Promise<void> => {
    beginShutdown();

    // The supervisor drains admitted site work before this final socket cleanup.
    // Incomplete headers/body streams must not keep the installation alive.
    for (const server of servers) {
      server.closeAllConnections();
    }
    const results = await shutdown!;
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);

    if (failures.length) {
      throw new AggregateError(failures, 'Local site listener shutdown failed');
    }
  };

  try {
    for (const endpoint of endpoints.values()) {
      const server = createServer((request, response) => {
        const hosts = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host');
        const target = request.url?.split('?')[0] ?? '';
        const validHost = hosts.length === 1 && endpoint.authorities.has((request.headers.host ?? '').toLowerCase());

        if (!validHost || /^\/(?:admin|api\/(?:admin|health))(?:\/|$)/.test(target)) {
          response.shouldKeepAlive = false;
          response.writeHead(validHost ? 404 : 421, { 'Cache-Control': 'no-store', Connection: 'close' }).end();

          return;
        }
        gateway.emit('request', request, response);
      });

      server.on('upgrade', (_request, socket) => socket.destroy());
      servers.push(server);

      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(endpoint.port, endpoint.host, () => {
            server.off('error', reject);
            resolve();
          });
        });
      } catch (error) {
        throw new LocalSiteListenerError(endpoint.origin, error);
      }
    }

    return { origins: [...origins], beginShutdown, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Local site listener startup failed');
    }
    throw error;
  }
}
