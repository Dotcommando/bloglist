import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type { IResolutionSitePort } from '../../../../ports/outbound/diagnostics/resolution-site.port.js';

export class ResolutionSiteAdapter implements IResolutionSitePort {
  constructor(private readonly sites: IGetSite) {}

  async timeZone(siteId: string): Promise<string> {
    const site = await this.sites.execute({ siteId });

    if (!site) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
    if (site.siteId !== siteId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign site');
    }

    return site.timeZone;
  }
}
