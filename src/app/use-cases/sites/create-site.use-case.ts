import { Site } from '../../../domain/sites/site.js';
import { SiteStatus } from '../../../domain/sites/site-status.enum.js';
import type { ICreateSite, ICreateSiteInput } from '../../../ports/inbound/sites/create-site.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteCreationValues } from '../../../ports/outbound/sites/site-creation-values.port.js';
import { SiteConflictError } from '../../errors/sites/site-conflict.error.js';

export class CreateSiteUseCase implements ICreateSite {
  constructor(
    private readonly sites: ISiteRepository,
    private readonly creationValues: ISiteCreationValues,
  ) {}

  async execute(input: ICreateSiteInput): Promise<Site> {
    const at = this.creationValues.currentInstant();
    const site = new Site({
      siteId: this.creationValues.nextSiteId(),
      mark: input.mark,
      name: input.name,
      primaryDomain: input.primaryDomain,
      languages: input.languages,
      defaultLanguage: input.defaultLanguage,
      status: SiteStatus.ACTIVE,
      createdAt: at,
      updatedAt: at,
    });

    if (await this.sites.findByMark(site.mark)) {
      throw new SiteConflictError('Site mark is already in use');
    }
    if (await this.sites.findByPrimaryDomain(site.primaryDomain)) {
      throw new SiteConflictError('Site primary domain is already in use');
    }

    return this.sites.save(site);
  }
}
