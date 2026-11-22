import { requireCondition, requireTimeZone } from '../shared/validation.js';

export function requireSiteTimeZone(value: string): void {
  requireCondition(value.length <= 128 && /^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value), 'Expected an IANA zone name');
  requireTimeZone(value);
}
