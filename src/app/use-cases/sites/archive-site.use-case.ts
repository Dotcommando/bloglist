import { Site } from '../../../domain/sites/site.js';
import type { IArchiveSite, IArchiveSiteInput } from '../../../ports/inbound/sites/archive-site.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import { SiteNotFoundError } from '../../errors/sites/site-not-found.error.js';

export class ArchiveSiteUseCase implements IArchiveSite {
  constructor(private readonly sites: ISiteRepository) {}

  async execute(input: IArchiveSiteInput): Promise<Site> {
    const existing = await this.sites.findById(input.siteId);

    if (!existing) {
      throw new SiteNotFoundError(input.siteId);
    }

    const site = new Site(existing.toState());

    site.archive();

    return this.sites.save(site);
  }
}
