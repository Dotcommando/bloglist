import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';

import { applyTrustedEdgeProxy } from '../../src/adapters/inbound/gateway/http/edge-proxy.boundary.js';

describe('trusted edge proxy boundary', () => {
  function request(host = 'example.test', secret = 'secret'): IncomingMessage {
    const incoming = new IncomingMessage(new Socket());

    incoming.headers = { host: 'origin.test', 'x-zarya-public-host': host, 'x-zarya-proxy-secret': secret };
    incoming.rawHeaders = ['Host', 'origin.test', 'x-zarya-public-host', host, 'x-zarya-proxy-secret', secret];

    return incoming;
  }

  it('restores the authenticated public authority and removes the service credential', () => {
    const incoming = request();

    applyTrustedEdgeProxy(incoming, 'secret');
    expect(incoming.headers.host).toBe('example.test');
    expect(incoming.rawHeaders).toEqual(['Host', 'example.test']);
    expect(incoming.headers['x-zarya-proxy-secret']).toBeUndefined();
  });

  it('rejects wrong, incomplete, duplicated or malformed proxy headers', () => {
    expect(() => applyTrustedEdgeProxy(request(), undefined)).toThrow();
    expect(() => applyTrustedEdgeProxy(request('example.test', 'wrong'), 'secret')).toThrow();
    expect(() => applyTrustedEdgeProxy(request('example.test/path'), 'secret')).toThrow();
    const incoming = request();

    incoming.rawHeaders.push('x-zarya-public-host', 'foreign.test');
    expect(() => applyTrustedEdgeProxy(incoming, 'secret')).toThrow();
  });

  it('leaves direct requests and untrusted forwarded-host metadata unchanged', () => {
    const incoming = new IncomingMessage(new Socket());

    incoming.headers = { host: 'example.test', 'x-forwarded-host': 'foreign.test' };
    incoming.rawHeaders = ['Host', 'example.test'];

    applyTrustedEdgeProxy(incoming, 'secret');
    expect(incoming.headers.host).toBe('example.test');
  });
});
