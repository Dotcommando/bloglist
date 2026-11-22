import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IGetSite } from '../../../../../ports/inbound/sites/get-site.port.js';
import type { IAssetAccessPort } from '../../../../../ports/outbound/media/asset-access.port.js';
import { assertLocalAdministrator, type ILocalOperatorContext } from '../local-operator.context.js';

export class LocalAssetAccessAdapter implements IAssetAccessPort {
  constructor(private readonly context: ILocalOperatorContext, private readonly sites: IGetSite) {}

  async requirePermission(siteId: string, actorId: string): Promise<void> {
    if (actorId !== this.context.operatorId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Untrusted actor');
    }
    await this.requireProcessing(siteId);
  }

  async requireProcessing(siteId: string): Promise<void> {
    assertLocalAdministrator(this.context);

    if (!siteId.trim()) {
      throw new BusinessError(BusinessErrorCode.Validation, 'siteId is required');
    }
    if (!await this.sites.execute({ siteId })) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }
}
