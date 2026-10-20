import type { Site } from '../../../domain/sites/site.js';
import type { IListSites } from '../../../ports/inbound/sites/list-sites.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';

export class ListSitesUseCase implements IListSites {
  constructor(private readonly sites: ISiteRepository) {}

  execute(): Promise<Site[]> {
    return this.sites.findAll();
  }
}
