import {
  randomBytes, timingSafeEqual,
} from 'node:crypto';
import {
  lookup,
} from 'node:dns/promises';
import type { RequestOptions } from 'node:https';
import {
  request,
} from 'node:https';
import {
  BlockList, isIP,
} from 'node:net';

import {
  BusinessError, BusinessErrorCode,
} from '../../../../domain/shared/business-error.js';
import type {
  IAdminAddressReachabilityPort,
} from '../../../../ports/outbound/installation/installation-settings-store.port.js';
import {
  adminAddressProof,
} from '../../../shared/admin-address-proof.js';

const blocked = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv4');
}

const globalV6 = new BlockList();

globalV6.addSubnet('2000::', 3, 'ipv6');

blocked.addSubnet('2001::', 23, 'ipv6');

blocked.addSubnet('2001:db8::', 32, 'ipv6');

blocked.addSubnet('2002::', 16, 'ipv6');

blocked.addSubnet('3fff::', 20, 'ipv6');

export function isGlobalAddress(address: string): boolean {
  const family = isIP(address);

  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export interface IAdminProbeResponse {
  readonly statusCode?: number | undefined;
  readonly headers: { readonly [name: string]: string | readonly string[] | undefined };
  on(event: 'error', callback: (error: Error) => void): void;
  resume(): void;
}

export type AdminProbeTransport = (url: URL, options: RequestOptions,
  callback: (response: IAdminProbeResponse) => void) => {
  on(event: 'error', callback: (error: Error) => void): void;
  end(): void;
};

export class AdminAddressReachabilityAdapter implements IAdminAddressReachabilityPort {
  constructor(private readonly key: () => Promise<string>,
    private readonly resolve: (hostname: string) => Promise<readonly { address: string; family: number }[]>
      = (hostname) => lookup(hostname, { all: true, verbatim: true }),
    private readonly transport: AdminProbeTransport = (url, options, callback) => request(url, options,
      (incoming) => callback(incoming))) {}

  async verify(origin: string): Promise<void> {
    const signal = AbortSignal.timeout(10000);
    let probing = false;

    try {
      await new Promise<void>((resolve, reject) => {
        const abort = (): void => reject(new Error('Address verification timed out'));

        signal.addEventListener('abort', abort, { once: true });
        const pending = (async (): Promise<void> => {
          const key = await this.key();

          signal.throwIfAborted();
          probing = true;
          await this.probe(origin, signal, key);
        })();

        void pending.then(resolve, reject).finally(() => {
          signal.removeEventListener('abort', abort);
        });
      });
    } catch (error) {
      if (!probing) {
        throw error;
      }
      throw new BusinessError(BusinessErrorCode.Validation, 'Administration is unavailable at the new address');
    }
  }

  private async probe(origin: string, signal: AbortSignal, key: string): Promise<void> {
    const url = new URL('/admin/', origin);
    const addresses = await this.resolve(url.hostname);

    signal.throwIfAborted();

    if (!addresses.length || addresses.some((answer) => !isGlobalAddress(answer.address))) {
      throw new Error('Non-global administration destination');
    }

    const selected = addresses[0]!;
    const nonce = randomBytes(32).toString('hex');
    const expected = adminAddressProof(key, url.host, nonce);

    url.searchParams.set('zarya-admin-probe', nonce);
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const outgoing = this.transport(url, {
        method: 'HEAD',
        agent: false,
        signal,
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [selected]);
          } else {
            callback(null, selected.address, selected.family);
          }
        },
      }, (incoming) => {
        incoming.on('error', reject);
        incoming.resume();
        const actual = incoming.headers['x-zarya-admin-proof'];

        if (
          incoming.statusCode !== 200
          || typeof incoming.headers['content-type'] !== 'string'
          || !incoming.headers['content-type'].startsWith('text/html')
          || typeof actual !== 'string'
          || !/^[a-f0-9]{64}$/.test(actual)
          || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
        ) {
          reject(new Error('Administration proof mismatch'));
        } else {
          resolve();
        }
      });

      outgoing.on('error', reject);
      outgoing.end();
    });
  }
}
