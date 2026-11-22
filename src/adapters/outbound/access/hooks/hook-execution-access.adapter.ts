import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IPageAccessPort } from '../../../../ports/outbound/pages/page-access.port.js';
import type { ISiteAccessPort } from '../../../../ports/outbound/sites/site-access.port.js';

export class HookExecutionAccessAdapter implements IPageAccessPort, ISiteAccessPort {
  constructor(private readonly trustedSiteId: string) {}

  private scoped(siteId: string): void {
    if (siteId !== this.trustedSiteId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Foreign hook execution scope');
    }
  }

  async assertCanCreateSite(): Promise<void> {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Site hook cannot create installations');
  }

  async assertCanReadSite(siteId: string): Promise<void> {
    this.scoped(siteId);
  }

  async assertCanListSites(): Promise<void> {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Site hook cannot list installations');
  }

  async assertCanCreatePage(siteId: string): Promise<void> {
    this.scoped(siteId);
  }

  async assertCanReadPage(siteId: string): Promise<void> {
    this.scoped(siteId);
  }

  async assertCanUpdatePage(siteId: string): Promise<void> {
    this.scoped(siteId);
  }
}
