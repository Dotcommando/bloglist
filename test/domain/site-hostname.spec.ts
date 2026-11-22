import { Site } from '../../src/domain/sites/site.js';
import { siteFixture } from '../support/sites.js';

describe('site hostname validation', () => {
  it('rejects an explicitly supplied default HTTPS port rather than silently stripping it', () => {
    expect(() => new Site({ ...siteFixture().toState(), primaryDomain: 'example.test:443' })).toThrow();
  });

  it('uses standard IDN normalization and keeps bracketed IPv6 hosts usable', () => {
    expect(new Site({ ...siteFixture().toState(), primaryDomain: 'b\u00fccher.test' }).primaryDomain)
      .toBe('xn--bcher-kva.test');
    expect(new Site({ ...siteFixture().toState(), primaryDomain: '[::1]' }).primaryDomain).toBe('[::1]');
  });
});
