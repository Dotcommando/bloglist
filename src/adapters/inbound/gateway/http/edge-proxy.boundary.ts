import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Restore Host only from an explicitly configured, authenticated edge proxy. */
export function applyTrustedEdgeProxy(request: IncomingMessage, secret: string | undefined): void {
  const hostName = 'x-zarya-public-host';
  const secretName = 'x-zarya-proxy-secret';
  const host = request.headers[hostName];
  const supplied = request.headers[secretName];

  if (host === undefined && supplied === undefined) {
    return;
  }

  const count = (name: string): number => request.rawHeaders.filter((value, index) =>
    index % 2 === 0 && value.toLowerCase() === name).length;

  if (
    !secret
    || typeof host !== 'string'
    || typeof supplied !== 'string'
    || count(hostName) !== 1
    || count(secretName) !== 1
    || count('host') !== 1
    || /[\s,@/\\?#]/.test(host)
  ) {
    throw new Error('Untrusted edge proxy');
  }

  const hash = (value: string): Buffer => createHash('sha256').update(value).digest();

  if (!timingSafeEqual(hash(secret), hash(supplied))) {
    throw new Error('Untrusted edge proxy');
  }

  const authority = new URL('http://' + host);

  if (authority.host !== host.toLowerCase() || authority.username || authority.password) {
    throw new Error('Invalid public authority');
  }
  request.headers.host = authority.host;
  delete request.headers[hostName];
  delete request.headers[secretName];
  const raw: string[] = [];

  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index]!;

    if ([hostName, secretName].includes(name.toLowerCase())) {
      continue;
    }
    raw.push(name, name.toLowerCase() === 'host' ? authority.host : request.rawHeaders[index + 1]!);
  }
  request.rawHeaders = raw;
}
