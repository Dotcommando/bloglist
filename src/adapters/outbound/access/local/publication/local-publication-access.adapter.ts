import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IPublicationAccessPort } from '../../../../../ports/outbound/publication/publication-access.port.js';
import { assertLocalAdministrator, type ILocalOperatorContext } from '../local-operator.context.js';

export class LocalPublicationAccessAdapter implements IPublicationAccessPort {
  constructor(private readonly context: ILocalOperatorContext) {}

  async assertEditor(siteId: string, actorId?: string): Promise<void> {
    assertLocalAdministrator(this.context);

    if (!siteId.trim() || (actorId !== undefined && actorId !== this.context.operatorId)) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Trusted local editor required');
    }
  }
}
