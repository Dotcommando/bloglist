import { JsonLdDocumentAdapter } from '../../src/adapters/outbound/rendering/html/json-ld-document.adapter.js';

it('embeds one generated graph safely and replaces only the previously generated graph', () => {
  const adapter = new JsonLdDocumentAdapter();
  const graph = { '@context': 'https://schema.org' as const, '@graph': [{ '@type': 'Article', name: '</script><img src=x>' }] };
  const first = adapter.embed('<html><head><title>Title</title></head><body><h1>Text</h1></body></html>', graph);
  const second = adapter.embed(first, { ...graph, '@graph': [{ '@type': 'Article', name: 'New' }] });

  expect(first).toContain('\\u003c/script\\u003e');
  expect(first).not.toContain('<img src=x>');
  expect(second.match(/application\/ld\+json/g)).toHaveLength(1);
  expect(second).toContain('New');
  expect(second).toContain('<h1>Text</h1>');
  expect(adapter.embed(second, null)).not.toContain('application/ld+json');
});
