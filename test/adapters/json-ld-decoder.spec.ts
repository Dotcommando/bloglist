import { decodeJsonLdContext } from '../../src/adapters/outbound/publication/files/json-ld-decoder.js';

it('restores a captured JSON-LD context and rejects corrupt or foreign ownership', () => {
  const context = {
    origin: 'https://example.test',
    catalog: {
      siteId: 'site-1', version: 'v1', profiles: [], objects: [],
    },
    routes: [{ kind: 'page', pageId: 'p', urlId: 'u', path: '/p/' }],
  };

  expect(decodeJsonLdContext(context, 'site-1')).toEqual(context);
  expect(() => decodeJsonLdContext(context, 'foreign')).toThrow();
  expect(() => decodeJsonLdContext({ ...context, routes: [{ kind: 'page' }] }, 'site-1')).toThrow();
});
