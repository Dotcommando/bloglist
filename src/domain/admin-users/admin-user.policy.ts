import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { requireCondition } from '../shared/validation.js';
import type { AdminUser } from './admin-user.js';
import type { IAdminUserProfile } from './admin-user-profile.js';

export const MIN_ADMIN_PASSWORD_LENGTH = 15;

export const MAX_ADMIN_PASSWORD_LENGTH = 1024;

export const MAX_ADMIN_USER_PAGE_SIZE = 100;

export const DEFAULT_ADMIN_USER_PAGE_SIZE = 20;

export function normalizeAdminEmail(email: string): string {
  const normalized = email.trim().normalize('NFC').toLowerCase();
  const parts = normalized.split('@');
  const local = parts[0];
  const domain = parts[1];
  const invalidLocal = Array.from(local ?? '').some((char) => char.charCodeAt(0) < 33
    || char.charCodeAt(0) === 127 || '<>()[]\\,;:"'.includes(char));

  requireCondition(normalized.length <= 254 && parts.length === 2 && Boolean(local) && Boolean(domain)
    && !/\s/.test(normalized) && (local?.length ?? 0) <= 64 && !invalidLocal
    && !local?.startsWith('.') && !local?.endsWith('.') && !local?.includes('..'), 'Invalid administrator email');

  try {
    const parsed = new URL('http://' + domain);

    requireCondition(parsed.hostname === parsed.host && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash && !/[\\/:?#]/.test(domain ?? '')
      && parsed.hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)),
    'Invalid email domain');

    const canonical = local + '@' + parsed.hostname;

    requireCondition(canonical.length <= 254, 'Administrator email is too long');

    return canonical;
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid administrator email');
  }
}

export function validateAdminPassword(password: string): void {
  const length = Array.from(password).length;

  requireCondition(length >= MIN_ADMIN_PASSWORD_LENGTH && length <= MAX_ADMIN_PASSWORD_LENGTH
    && !/[\r\n]/u.test(password) && !password.includes('\0'),
  'Administrator password must contain 15 to 1024 characters');
}

export function requireEmptySiteAssignments(siteIds: readonly string[]): void {
  requireCondition(Array.isArray(siteIds) && siteIds.length === 0,
    'Site assignments are reserved; allowedSiteIds must remain empty');
}

export function requireAnotherActiveAdministrator(activeCount: number): void {
  if (activeCount <= 1) {
    throw new BusinessError(BusinessErrorCode.LastAdministrator, 'The last active administrator must remain active');
  }
}

export function requireAdminUserForChange(user: AdminUser | null, adminUserId: string,
  expectedVersion: string): AdminUser {
  if (user?.toState().deletedAt !== null) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Administrator not found');
  }
  if (user.toState().adminUserId !== adminUserId) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent administrator identity');
  }
  if (user.toState().version !== expectedVersion) {
    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Administrator changed');
  }

  return user;
}

export function requireInstallationAdministrator(user: IAdminUserProfile): void {
  if (user.blocked || user.authorization?.systemAdmin !== true) {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Active installation administrator required');
  }
}
