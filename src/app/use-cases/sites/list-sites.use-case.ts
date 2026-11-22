import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { Site } from '../../../domain/sites/site.js';
import type { IListSites } from '../../../ports/inbound/sites/list-sites.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteAccessPort } from '../../../ports/outbound/sites/site-access.port.js';

export class ListSitesUseCase implements IListSites {
  constructor(private readonly sites: ISiteRepository, private readonly access: ISiteAccessPort,
    private readonly siteId?: string) {}

  async execute(): Promise<Site[]> {
    await this.access.assertCanListSites();
    const allowed = await this.access.listAuthorizedSiteIds?.() ?? null;
    const selected = this.siteId === undefined ? null : await this.sites.findById(this.siteId);
    const sites = this.siteId !== undefined ? selected ? [selected] : []
      : allowed === null ? await this.sites.findAll()
        : (await Promise.all(allowed.map((siteId) => this.sites.findById(siteId))))
          .filter((site): site is Site => site !== null);

    if (new Set(sites.map((site) => site.siteId)).size !== sites.length) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Duplicate site identities in list');
    }

    for (const site of sites) {
      await this.access.assertCanReadSite(site.siteId);
    }

    return sites.map((site) => new Site(site.toState()));
  }
}
