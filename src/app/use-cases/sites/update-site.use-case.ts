import { Site } from '../../../domain/sites/site.js';
import type { IUpdateSite, IUpdateSiteInput } from '../../../ports/inbound/sites/update-site.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import { SiteConflictError } from '../../errors/sites/site-conflict.error.js';
import { SiteNotFoundError } from '../../errors/sites/site-not-found.error.js';

export class UpdateSiteUseCase implements IUpdateSite {
  constructor(private readonly sites: ISiteRepository) {}

  async execute(input: IUpdateSiteInput): Promise<Site> {
    const existing = await this.sites.findById(input.siteId);

    if (!existing) {
      throw new SiteNotFoundError(input.siteId);
    }

    const site = new Site(existing.toState());

    if (input.name !== undefined) {
      site.changeName(input.name);
    }
    if (input.primaryDomain !== undefined) {
      site.changePrimaryDomain(input.primaryDomain);
    }

    for (const language of input.addLanguages ?? []) {
      site.addLanguage(language);
    }

    if (input.defaultLanguage !== undefined) {
      site.changeDefaultLanguage(input.defaultLanguage);
    }

    for (const language of input.removeLanguages ?? []) {
      site.removeLanguage(language);
    }

    if (site.primaryDomain !== existing.primaryDomain) {
      const owner = await this.sites.findByPrimaryDomain(site.primaryDomain);

      if (owner && owner.siteId !== site.siteId) {
        throw new SiteConflictError('Site primary domain is already in use');
      }
    }

    return this.sites.save(site);
  }
}
