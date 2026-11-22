import { Site } from '../../src/domain/sites/site.js';
import { servingSiteAuthority, servingSiteOrigin } from '../../src/domain/sites/site-addresses.js';
import { onboardingAddresses } from '../../src/domain/sites/site-onboarding.policy.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { siteFixture } from '../support/sites.js';

describe('site onboarding addresses', () => {
  it.each([SiteOriginMode.Local, SiteOriginMode.Public])('normalizes an explicit %s choice', (originMode) => {
    const addresses = onboardingAddresses(' EXAMPLE.TEST ', 'localhost:3100/', originMode);

    expect(addresses).toEqual({ publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100', originMode });
    expect(servingSiteOrigin(addresses)).toBe(originMode === SiteOriginMode.Local
      ? 'http://localhost:3100' : 'https://example.test');
    const expected = originMode === SiteOriginMode.Local ? 'localhost:3100' : 'example.test';

    expect(servingSiteAuthority(addresses)).toBe(expected);
  });

  it.each(['localhost', 'sub.localhost', '127.0.0.1', 'example.test:3000', 'https://example.test',
    'example.test/path'])('rejects a future domain that is not a domain name: %s', (domain) => {
    expect(() => onboardingAddresses(domain, 'localhost:3100', SiteOriginMode.Local)).toThrow();
  });

  it.each(['localhost', 'http://localhost', 'localhost:0', 'localhost:65536', 'localhost:3100/path',
    'http://user:password@localhost:3100', 'localhost:3100?test=1', 'localhost:3100#test',
    'ftp://localhost:3100'])('requires a valid HTTP(S) development address with a port: %s', (address) => {
    expect(() => onboardingAddresses('example.test', address, SiteOriginMode.Public)).toThrow();
  });

  it('requires a persistent serving choice and both addresses once configured', () => {
    const site = new Site({
      ...siteFixture().toState(),
      addresses: onboardingAddresses('example.test', 'localhost:3100', SiteOriginMode.Local),
    });

    expect(() => site.changeAddresses({ publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100' }))
      .toThrow();
    expect(() => site.changeAddresses({
      publicOrigin: null,
      localOrigin: 'http://localhost:3100',
      originMode: SiteOriginMode.Local,
    })).toThrow();
  });
});
