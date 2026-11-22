import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export class JsonLdValidationError extends BusinessError {
  constructor(message: string) {
    super(BusinessErrorCode.Validation, message);
  }
}
