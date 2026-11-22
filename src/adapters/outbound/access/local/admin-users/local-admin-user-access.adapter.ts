import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IAdminUserAccessPort } from '../../../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import { assertLocalAdministrator, type ILocalOperatorContext } from '../local-operator.context.js';

export class LocalAdminUserAccessAdapter implements IAdminUserAccessPort {
  private readonly context: ILocalOperatorContext;

  constructor(context: ILocalOperatorContext) {
    this.context = Object.freeze({ ...context });
  }

  async requireAdministrator(actorId: string): Promise<void> {
    assertLocalAdministrator(this.context);

    if (actorId !== this.context.operatorId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Untrusted local administrator actor');
    }
  }
}
