import type { AddressInfo } from 'node:net';

export interface IHttpStartupSite {
  readonly name: string;
  readonly siteId: string;
  readonly origin: string | null;
  readonly localListenerReady: boolean;
}

interface IHttpReadyInput {
  readonly elapsedMs: number;
  readonly address: AddressInfo;
  readonly administrationOrigin: string | null;
  readonly sites: readonly IHttpStartupSite[];
}

export function httpReadyMessage(input: IHttpReadyInput): string {
  const host = input.address.family === 'IPv6' ? `[${input.address.address}]` : input.address.address;
  const lines = [
    'Zarya HTTP server is ready.',
    `Startup time: ${(input.elapsedMs / 1000).toFixed(2)} s.`,
    `Listening socket: ${host}:${input.address.port}`,
  ];

  if (input.administrationOrigin) {
    lines.push('Administration: ' + new URL('/admin/', input.administrationOrigin).href);
  }
  if (input.sites.length) {
    lines.push('', 'Sites (configured addresses):');

    for (const site of input.sites) {
      const status = site.origin === null ? '' : site.localListenerReady
        ? ' [local HTTP listener ready]' : ' [external routing required]';

      lines.push(`- ${site.origin ?? '(address not configured)'} - ${site.name.replace(/\p{Cc}/gu, ' ')}${status}`);
    }

    if (input.administrationOrigin) {
      lines.push('', 'Site administration:');
    }

    for (const site of input.sites) {
      const name = site.name.replace(/\p{Cc}/gu, ' ');

      if (input.administrationOrigin) {
        const address = new URL('/admin/sites/' + encodeURIComponent(site.siteId), input.administrationOrigin);

        lines.push(`- ${address.href} - ${name}`);
      }
    }
  } else {
    lines.push('', 'No sites configured.');
  }

  return lines.join('\n');
}
