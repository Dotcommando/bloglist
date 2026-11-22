import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export class SiteLocalAddressInUseError extends BusinessError {
  constructor() {
    super(BusinessErrorCode.Conflict, 'The local address already belongs to another site');
    this.name = 'SiteLocalAddressInUseError';
  }
}
