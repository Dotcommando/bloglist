import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IRoutingAccessPort } from '../../../../../ports/outbound/routing/routing-access.port.js';
import type { IUrlBehaviorAccessPort } from '../../../../../ports/outbound/routing/url-behavior-values.port.js';
import { assertLocalAdministrator, type ILocalOperatorContext } from '../local-operator.context.js';

export class LocalRoutingAccessAdapter implements IRoutingAccessPort, IUrlBehaviorAccessPort {
  private readonly context: ILocalOperatorContext;

  constructor(context: ILocalOperatorContext) {
    this.context = Object.freeze({ ...context });
  }

  async assertCanAssignPageUrl(siteId: string): Promise<void> {
    this.assertAccess(siteId);
  }

  async requireEditor(siteId: string, actorId: string): Promise<void> {
    this.assertAccess(siteId);

    if (actorId !== this.context.operatorId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Untrusted editor');
    }
  }

  async assertCanChangePageUrl(siteId: string): Promise<void> {
    this.assertAccess(siteId);
  }

  async assertCanReadRouting(siteId: string): Promise<void> {
    this.assertAccess(siteId);
  }

  private assertAccess(siteId: string): void {
    assertLocalAdministrator(this.context);

    if (!siteId.trim()) {
      throw new RangeError('siteId is required');
    }
  }
}
