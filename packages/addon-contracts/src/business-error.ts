export enum BusinessErrorCode {
  HookDenied = 'HookDenied',
  HookUnavailable = 'HookUnavailable',
  HookOutcomeUnknown = 'HookOutcomeUnknown',
  AddonDisabled = 'AddonDisabled',
  AddonUnavailable = 'AddonUnavailable',
  Validation = 'Validation',
  NotFound = 'NotFound',
  Scope = 'Scope',
  Forbidden = 'Forbidden',
  Conflict = 'Conflict',
  StaleWrite = 'StaleWrite',
  InvalidTransition = 'InvalidTransition',
  CapacityUnavailable = 'CapacityUnavailable',
  NotBookable = 'NotBookable',
  IdempotencyConflict = 'IdempotencyConflict',
  LastAdministrator = 'LastAdministrator',
  InvalidCredentials = 'InvalidCredentials',
  AuthenticationRequired = 'AuthenticationRequired',
  TooManyAttempts = 'TooManyAttempts',
}

export class BusinessError extends Error {
  constructor(readonly code: BusinessErrorCode, message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}
