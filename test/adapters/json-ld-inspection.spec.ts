import { JsonLdInspectionAdapter } from '../../src/adapters/outbound/rendering/html/json-ld-inspection.adapter.js';

it('reads only generated JSON-LD and returns null when a document contains no generated graph', () => {
  const adapter = new JsonLdInspectionAdapter();
  const other = '<script type="application/ld+json">{"unrelated":true}</script>';

  expect(adapter.read(other)).toBeNull();
  const generated = '<script type="application/ld+json" data-zarya-json-ld>'
    + '{"@context":"https://schema.org","@graph":[{"name":"Свет"}]}</script>';

  expect(JSON.parse(adapter.read(other + generated)!)).toEqual({
    '@context': 'https://schema.org', '@graph': [{ name: 'Свет' }],
  });
  expect(() => adapter.read(generated + generated)).toThrow('Duplicate generated JSON-LD');
});

it.each(['{"@context":"https://foreign.test","@graph":[]}', '{"@context":"https://schema.org","@graph":{}}', '{'])('rejects corrupt generated data instead of presenting a successful empty graph: %s', (json) => {
  expect(() => new JsonLdInspectionAdapter().read('<script data-zarya-json-ld>' + json + '</script>')).toThrow();
});
