import type { ISiteReference } from '../../../../domain/pages/site-reference.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type { ISiteLookupPort } from '../../../../ports/outbound/pages/site-lookup.port.js';

export class PageSiteLookupAdapter implements ISiteLookupPort {
  constructor(private readonly getSite: IGetSite) {}

  async findSite(siteId: string): Promise<ISiteReference | null> {
    const site = await this.getSite.execute({ siteId });

    if (!site) {
      return null;
    }

    const { siteId: found, languages, transliteration, collapseTransliterationHyphens } = site.toState();

    return {
      siteId: found,
      languages,
      ...(transliteration === undefined ? {} : { transliteration }),
      ...(collapseTransliterationHyphens === undefined ? {} : { collapseTransliterationHyphens }),
    };
  }
}
