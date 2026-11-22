import type { IUrlState } from '../../../domain/routing/url.js';

export interface IRoutingSourcePort {
  readUrls(siteId: string): Promise<readonly IUrlState[]>;
}
