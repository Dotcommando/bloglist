import type { ISiteReference } from '../../../domain/clusters/site-reference.js';

export interface ISiteLookupPort {
  findSite(siteId: string): Promise<ISiteReference | null>;
}
