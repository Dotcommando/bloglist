import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';

export interface ILocalOperatorContext {
  readonly operatorId: string;
  readonly platformAdministrator: boolean;
}

export function assertLocalAdministrator(context: ILocalOperatorContext): void {
  if (!context.operatorId.trim() || context.platformAdministrator !== true) {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Explicit local administrator authority is required');
  }
}
