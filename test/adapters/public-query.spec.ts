import {
  parsePublicTarget,
} from '../../src/adapters/inbound/documents/http/publication/public-document.controller.js';
import { createCloudflareWorker } from '../../src/adapters/inbound/gateway/cloudflare/worker.js';

describe('bounded public document query data', () => {
  it('accepts arbitrary names, repeated values and data keys without prototype mutation', () => {
    const { query } = parsePublicTarget('/?future_partner=x&future_partner=y&__proto__=data&constructor=value',
      'example.test');

    expect(query.future_partner).toEqual(['x', 'y']);
    expect(Object.hasOwn(query, '__proto__')).toBe(true);
    expect(query.__proto__).toBe('data');
    expect(query.constructor).toBe('value');
    expect(Object.getPrototypeOf(query)).toBe(Object.prototype);
  });

  it('accepts the exact encoded-byte, pair-count and decoded-name budgets', () => {
    expect(parsePublicTarget('/?future=' + 'x'.repeat(12281), 'example.test').query.future).toHaveLength(12281);
    expect(parsePublicTarget('/?' + Array.from({ length: 128 }, () => 'a=b').join('&'), 'example.test').query.a)
      .toHaveLength(128);
    const name = 'я'.repeat(128);

    expect(parsePublicTarget('/?' + encodeURIComponent(name) + '=ok', 'example.test').query[name]).toBe('ok');
  });

  it.each([
    '/?future=' + 'x'.repeat(12282),
    '/?' + Array.from({ length: 129 }, () => 'a=b').join('&'),
    '/?' + encodeURIComponent('я'.repeat(129)) + '=value',
  ])('rejects excess query resources as URI-too-long', (target) => {
    expect(() => parsePublicTarget(target, 'example.test')).toThrow(expect.objectContaining({ statusCode: 414 }));
  });

  it('does not truncate data or accept malformed percent encoding', () => {
    expect(parsePublicTarget('/?new_partner=%E2%82%AC&empty=&flag', 'example.test').query)
      .toEqual({ new_partner: '€', empty: '', flag: '' });
    expect(() => parsePublicTarget('/?future=%ZZ', 'example.test')).toThrow();
    expect(() => parsePublicTarget('/?future=%FF', 'example.test')).toThrow();
  });

  it('applies the same public query limits at the edge before proxying or fetching assets', async () => {
    const assets = { fetch: vi.fn(async () => new Response('Static')) };
    const worker = createCloudflareWorker({
      publicOrigin: 'https://example.test',
      backendOrigin: 'https://origin.test',
      mediaPath: '/assets',
      requestPaths: ['/live/'],
      staticPolicies: {},
    });

    for (const target of ['/?future=' + 'x'.repeat(12282), '/live/?future=' + 'x'.repeat(12282)]) {
      const result = await worker.fetch(new Request('https://example.test' + target), { ASSETS: assets });

      expect(result.status).toBe(414);
      expect(result.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(assets.fetch).not.toHaveBeenCalled();
    expect((await worker.fetch(new Request('https://example.test/?new_partner=ok&new_partner=again'),
      { ASSETS: assets })).status).toBe(200);
  });
});
