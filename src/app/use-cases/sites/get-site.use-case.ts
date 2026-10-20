import type { Site } from '../../../domain/sites/site.js';
import type { IGetSite, IGetSiteInput } from '../../../ports/inbound/sites/get-site.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';

export class GetSiteUseCase implements IGetSite {
  constructor(private readonly sites: ISiteRepository) {}

  execute(input: IGetSiteInput): Promise<Site | null> {
    return this.sites.findById(input.siteId);
  }
}
