import { normalizeSiteAuthority } from './site-hostname.policy.js';
import { SiteOriginMode } from './site-origin-mode.enum.js';

export interface ISiteAddresses {
  readonly originMode?: SiteOriginMode;
  readonly publicOrigin: string | null;
  readonly localOrigin: string | null;
}

export function siteAddresses(value?: ISiteAddresses): ISiteAddresses {
  const result = value ?? { publicOrigin: null, localOrigin: null };

  for (const origin of [result.publicOrigin, result.localOrigin]) {
    if (origin === null) {
      continue;
    }

    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new RangeError('Expected an absolute HTTP(S) origin');
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.origin !== origin
      || parsed.username
      || parsed.password
    ) {
      throw new RangeError('Expected an HTTP(S) origin without path, query or credentials');
    }
  }

  if (
    result.originMode !== undefined
    && (!Object.values(SiteOriginMode).includes(result.originMode)
    || !result.publicOrigin
    || !result.localOrigin)
  ) {
    throw new RangeError('Both site origins and a valid serving choice are required');
  }

  return {
    publicOrigin: result.publicOrigin,
    localOrigin: result.localOrigin,
    ...(result.originMode === undefined ? {} : { originMode: result.originMode }),
  };
}

export function servingSiteOrigin(addresses?: ISiteAddresses): string | null {
  return addresses?.originMode === SiteOriginMode.Local ? addresses.localOrigin : addresses?.publicOrigin ?? null;
}

export function servingSiteAuthority(addresses?: ISiteAddresses): string | null {
  const origin = servingSiteOrigin(addresses);

  return addresses?.originMode !== undefined && origin ? normalizeSiteAuthority(new URL(origin).host) : null;
}
