import { DocumentOutputAdapter } from '../../src/adapters/outbound/rendering/html/document-output.adapter.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';

describe('published HTML output and declared request input', () => {
  it('normalizes declared values, ignores unknown fields and rejects invalid declared literals', () => {
    const output = new DocumentOutputAdapter();
    const schema = [{ name: 'count', kind: ParameterKind.Number, required: true },
      { name: 'enabled', kind: ParameterKind.Boolean, required: true }];

    expect(output.normalizeRequest(schema, { count: '0', enabled: 'false' })).toEqual({ count: 0, enabled: false });
    expect(() => output.normalizeRequest(schema, { count: '1px', enabled: 'false' })).toThrow();
    expect(output.normalizeRequest(schema, { count: 1, enabled: false, secret: 'x' }))
      .toEqual({ count: 1, enabled: false });
  });
  it.each([
    'fbclid', 'igsh', 'igshid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
    'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'ttclid', 'UTM_SOURCE', 'FBCLID',
    'future_partner_click', 'new_gtm_metadata', 'ref', 'source', 'tag[nested]',
  ])('ignores undeclared navigation metadata %s without exposing it to rendering', (name) => {
    const input = { [name]: 'campaign-value', count: '2' };
    const output = new DocumentOutputAdapter();

    expect(output.normalizeRequest([{ name: 'count', kind: ParameterKind.Number, required: true }], input))
      .toEqual({ count: 2 });
    expect(input[name]).toBe('campaign-value');
  });

  it('still validates explicitly declared fields while ignoring every undeclared input', () => {
    const output = new DocumentOutputAdapter();
    const schema = [{ name: 'utm_source', kind: ParameterKind.Enum, required: true, values: ['ig'] }];

    expect(output.normalizeRequest(schema, { utm_source: 'ig', fbclid: 'click' })).toEqual({ utm_source: 'ig' });
    expect(() => output.normalizeRequest(schema, { utm_source: 'invalid' })).toThrow();
    expect(() => output.normalizeRequest(schema, { fbclid: 'click' })).toThrow();
    expect(output.normalizeRequest([], { fbclid: 'click', unknown: 'value' })).toEqual({});
    expect(output.normalizeRequest([], { utm: 'value' })).toEqual({});
    expect(output.normalizeRequest([], { ref: 'value' })).toEqual({});
  });

  it('places only prebuilt CSS/JS into the output and returns CSP hashes of actual style text', async () => {
    const output = new DocumentOutputAdapter();
    const result = await output.complete('<html><head><title>A</title></head><body>A</body></html>', {
      head: '<style data-zarya="page-reflow">h1{width:100px}</style>',
      body: '<link rel="stylesheet" href="/assets/color.css">',
    });

    expect(result.html).toContain('<style data-zarya="page-reflow">h1{width:100px}</style></head>');
    expect(result.inlineStyleHashes).toEqual(output.inlineStyleHashes(result.html));
    expect(result.inlineStyleHashes).toHaveLength(1);
    expect(result.inlineStyleHashes[0]).toMatch(/^sha256-/);
  });
});
