import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import { Site } from '../../../domain/sites/site.js';
import type { IGetSite, IGetSiteInput } from '../../../ports/inbound/sites/get-site.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteAccessPort } from '../../../ports/outbound/sites/site-access.port.js';

export class GetSiteUseCase implements IGetSite {
  constructor(private readonly repository: ISiteRepository, private readonly access: ISiteAccessPort) {}

  async execute(input: IGetSiteInput): Promise<Site | null> {
    await this.access.assertCanReadSite(input.siteId);
    requireText(input.siteId, 'siteId');
    const site = await this.repository.findById(input.siteId);

    if (site && site.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent site identity');
    }

    return site ? new Site(site.toState()) : null;
  }
}
