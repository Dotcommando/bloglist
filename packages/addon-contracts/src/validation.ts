import { BusinessError, BusinessErrorCode } from './business-error.js';

export function requireCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new BusinessError(BusinessErrorCode.Validation, message);
  }
}

export function requireText(value: string, name: string): void {
  requireCondition(value.trim().length > 0, `${name} is required`);
}

export function requireInteger(value: number, minimum: number, name: string): void {
  requireCondition(Number.isSafeInteger(value) && value >= minimum, `Invalid ${name}`);
}

export function requireInstant(value: Date, name: string): void {
  requireCondition(Number.isFinite(value.getTime()), `Invalid ${name} instant`);
}

export function requireTimeZone(value: string): void {
  requireText(value, 'timeZone');

  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid IANA time zone');
  }
}

export function requireNewVersion(previous: string, next: string): void {
  requireText(next, 'nextVersion');
  requireCondition(previous !== next, 'A transition requires a new version');
}

export function requireAssetPath(value: string): void {
  requireText(value, 'asset path');
  requireCondition(
    !value.startsWith('/') && !/[\\?#:]/.test(value)
      && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    'Expected a safe relative artifact path',
  );
}
