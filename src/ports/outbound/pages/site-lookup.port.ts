import type { ISiteReference } from '../../../domain/pages/site-reference.js';

export interface ISiteLookupPort {
  findSite(siteId: string): Promise<ISiteReference | null>;
}
