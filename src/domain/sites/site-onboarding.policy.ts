import { type ISiteAddresses, siteAddresses } from './site-addresses.js';
import { normalizeSiteHostname } from './site-hostname.policy.js';
import type { SiteOriginMode } from './site-origin-mode.enum.js';

export function onboardingAddresses(domain: string, localAddress: string, originMode: SiteOriginMode): ISiteAddresses {
  const hostname = normalizeSiteHostname(domain);

  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || /^[\d.]+$/.test(hostname)
    || hostname.includes(':')
  ) {
    throw new RangeError('A future domain name is required, separate from the development address');
  }

  const raw = localAddress.trim();
  const local = new URL(raw.includes('://') ? raw : 'http://' + raw);
  const port = /:([0-9]+)\/?$/.exec(raw);

  if (
    !port
    || Number(port[1]) < 1
    || Number(port[1]) > 65535
    || !['http:', 'https:'].includes(local.protocol)
    || local.pathname !== '/'
    || local.search
    || local.hash
    || local.username
    || local.password
  ) {
    throw new RangeError('Development address must include an explicit port and no path or credentials');
  }

  return siteAddresses({ publicOrigin: 'https://' + hostname, localOrigin: local.origin, originMode });
}
