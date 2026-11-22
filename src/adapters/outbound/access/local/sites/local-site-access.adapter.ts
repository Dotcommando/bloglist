import type { ISiteAccessPort, ISiteEditingAccessPort } from '../../../../../ports/outbound/sites/site-access.port.js';
import { assertLocalAdministrator, type ILocalOperatorContext } from '../local-operator.context.js';

export class LocalSiteAccessAdapter implements ISiteAccessPort, ISiteEditingAccessPort {
  private readonly context: ILocalOperatorContext;

  constructor(context: ILocalOperatorContext) {
    this.context = Object.freeze({ ...context });
  }

  async assertCanCreateSite(): Promise<void> {
    assertLocalAdministrator(this.context);
  }

  async assertCanUpdateSite(siteId: string): Promise<void> {
    await this.assertCanReadSite(siteId);
  }

  async assertCanArchiveSite(siteId: string): Promise<void> {
    await this.assertCanReadSite(siteId);
  }

  async assertCanListSites(): Promise<void> {
    assertLocalAdministrator(this.context);
  }

  async assertCanReadSite(siteId: string): Promise<void> {
    assertLocalAdministrator(this.context);

    if (!siteId.trim()) {
      throw new RangeError('siteId is required');
    }
  }
}
