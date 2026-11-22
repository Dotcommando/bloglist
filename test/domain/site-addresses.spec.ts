import { Site } from '../../src/domain/sites/site.js';
import { siteAddresses } from '../../src/domain/sites/site-addresses.js';
import { siteFixture } from '../support/sites.js';

describe('site addresses', () => {
  it('preserves unconfigured legacy sites and explicit public/local origins', () => {
    expect(siteAddresses()).toEqual({ publicOrigin: null, localOrigin: null });
    const addresses = { publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100' };

    expect(new Site({ ...siteFixture().toState(), addresses }).toState().addresses).toEqual(addresses);
  });
  it.each(['javascript:alert(1)', 'https://user:password@example.test', 'https://example.test/path',
    'https://example.test/?a=1', '//example.test', 'https://example.test/',
    'https://example.test#x'])('rejects invalid origins: %s', (publicOrigin) => {
    expect(() => siteAddresses({ publicOrigin, localOrigin: null })).toThrow();
  });
});
