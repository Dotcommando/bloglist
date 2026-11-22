import { SiteOriginMode } from '../urls/urls.types';

interface ISiteCreationDraft {
  readonly name: string;
  readonly mark: string;
  readonly domain: string;
  readonly language: string;
  readonly localAddress: string;
  readonly originMode: SiteOriginMode | null;
}

const key = 'zarya.admin.siteCreationDraft';

export function readSiteCreationDraft(): ISiteCreationDraft | null {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    const value: unknown = stored ? JSON.parse(stored) : null;

    if (
      !value
      || typeof value !== 'object'
      || !('name' in value)
      || typeof value.name !== 'string'
      || !('mark' in value)
      || typeof value.mark !== 'string'
      || !('domain' in value)
      || typeof value.domain !== 'string'
      || !('language' in value)
      || typeof value.language !== 'string'
      || !('localAddress' in value)
      || typeof value.localAddress !== 'string'
      || !('originMode' in value)
      || value.originMode !== null
        && value.originMode !== SiteOriginMode.Local
      && value.originMode !== SiteOriginMode.Public
    ) {
      return null;
    }

    return {
      name: value.name,
      mark: value.mark,
      domain: value.domain,
      language: value.language,
      localAddress: value.localAddress,
      originMode: value.originMode,
    };
  } catch {
    return null;
  }
}

export function writeSiteCreationDraft(draft: ISiteCreationDraft): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(draft));
  } catch {
    // Site creation remains available when browser storage is blocked or full.
  }
}

export function clearSiteCreationDraft(): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // A storage failure must not turn successful creation into a failed request.
  }
}
