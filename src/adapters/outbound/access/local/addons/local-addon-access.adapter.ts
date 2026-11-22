import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { ISiteAddonAccessPort } from '../../../../../ports/outbound/addons/site-addon-access.port.js';
import type { ILocalOperatorContext } from '../local-operator.context.js';

export class LocalAddonAccessAdapter implements ISiteAddonAccessPort {
  constructor(private readonly operator: ILocalOperatorContext,
    private readonly siteExists: (siteId: string) => Promise<boolean>) {}

  async requireAdministrator(siteId: string, actorId: string): Promise<void> {
    if (!this.operator.platformAdministrator || actorId !== this.operator.operatorId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Trusted operator required');
    }
    if (!await this.siteExists(siteId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }
}
