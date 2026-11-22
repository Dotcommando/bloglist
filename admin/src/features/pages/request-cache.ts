import { type IRequestCachePolicy, RequestCacheScope } from '../../shared/api/content.types.js';

function readPolicy(value: unknown, field: string): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid cache policy');
  }

  const raw = Object.fromEntries(Object.entries(value));
  const age = raw[field];

  if (
    raw.scope !== RequestCacheScope.SharedPublic
    || typeof age !== 'number'
    || !Number.isSafeInteger(age)
    || age <= 0
    || age > 3600000
    || Object.keys(raw).some((key) => !['scope', field].includes(key))
  ) {
    throw new Error('Invalid cache policy');
  }

  return age;
}

export function readRequestCachePolicy(value: unknown): IRequestCachePolicy {
  return { scope: RequestCacheScope.SharedPublic, ttlMs: readPolicy(value, 'ttlMs') };
}

export function readSnippetCachePolicy(value: unknown): { scope: RequestCacheScope; maxAgeMs: number } {
  return { scope: RequestCacheScope.SharedPublic, maxAgeMs: readPolicy(value, 'maxAgeMs') };
}
