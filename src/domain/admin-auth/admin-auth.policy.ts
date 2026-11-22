import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { requireCondition, requireInstant, requireInteger, requireText } from '../shared/validation.js';

export const ADMIN_AUTH_SESSION_MONTHS = 2;

export const ADMIN_LOGIN_FAILURE_LIMIT = 10;

export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const ADMIN_LOGIN_PAUSE_MS = 15 * 60 * 1000;

export const ADMIN_AUTH_LIST_LIMIT = 100;

export class AdminLoginThrottledError extends BusinessError {
  constructor(readonly retryAfterSeconds: number) {
    super(BusinessErrorCode.TooManyAttempts, 'Too many login attempts');
  }
}

export interface IAdminLoginAttempt {
  readonly loginKey: string;
  readonly failures: number;
  readonly windowStartedAt: Date;
  readonly blockedUntil: Date | null;
  readonly expiresAt: Date;
}

export function loginAttempt(loginKey: string, previous: IAdminLoginAttempt | null, at: Date): IAdminLoginAttempt {
  requireText(loginKey, 'loginKey');
  requireInstant(at, 'at');

  if (previous && previous.loginKey !== loginKey) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent login attempt identity');
  }
  if (previous?.blockedUntil && previous.blockedUntil > at) {
    throw new AdminLoginThrottledError(Math.ceil((previous.blockedUntil.getTime() - at.getTime()) / 1000));
  }
  if (
    !previous
    || previous.windowStartedAt.getTime() + ADMIN_LOGIN_WINDOW_MS <= at.getTime()
    || previous.blockedUntil !== null
  ) {
    return {
      loginKey,
      failures: 0,
      windowStartedAt: at,
      blockedUntil: null,
      expiresAt: new Date(at.getTime() + ADMIN_LOGIN_WINDOW_MS),
    };
  }

  return structuredClone(previous);
}

export function failedLogin(attempt: IAdminLoginAttempt, at: Date): IAdminLoginAttempt {
  requireInteger(attempt.failures, 0, 'failures');
  const failures = attempt.failures + 1;
  const blockedUntil = failures >= ADMIN_LOGIN_FAILURE_LIMIT ? new Date(at.getTime() + ADMIN_LOGIN_PAUSE_MS) : null;

  return { ...attempt, failures, blockedUntil, expiresAt: blockedUntil ?? attempt.expiresAt };
}

export function requireAuthListLimit(limit: number): void {
  requireCondition(Number.isSafeInteger(limit) && limit >= 1 && limit <= ADMIN_AUTH_LIST_LIMIT,
    'Invalid session list limit');
}
