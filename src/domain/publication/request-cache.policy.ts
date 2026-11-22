import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export enum RequestCacheScope { SharedPublic = 'SharedPublic' }

/** Only fixed public invocation inputs and time-bounded public reads are permitted. */
export interface ISnippetCachePolicy {
  readonly scope: RequestCacheScope;
  readonly maxAgeMs: number;
}

export interface IRequestCachePolicy {
  readonly scope: RequestCacheScope;
  readonly ttlMs: number;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid cache policy');
  }

  return Object.fromEntries(Object.entries(value));
}

export function parseRequestCachePolicy(value: unknown): IRequestCachePolicy {
  const raw = record(value);

  if (
    raw.scope !== RequestCacheScope.SharedPublic
    || typeof raw.ttlMs !== 'number'
    || !Number.isSafeInteger(raw.ttlMs)
    || raw.ttlMs <= 0
    || raw.ttlMs > 3600000
    || Object.keys(raw).some((key) => !['scope', 'ttlMs'].includes(key))
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid Request cache policy');
  }

  return { scope: RequestCacheScope.SharedPublic, ttlMs: raw.ttlMs };
}

export function parseSnippetCachePolicy(value: unknown): ISnippetCachePolicy {
  const raw = record(value);

  if (
    raw.scope !== RequestCacheScope.SharedPublic
    || typeof raw.maxAgeMs !== 'number'
    || !Number.isSafeInteger(raw.maxAgeMs)
    || raw.maxAgeMs <= 0
    || raw.maxAgeMs > 3600000
    || Object.keys(raw).some((key) => !['scope', 'maxAgeMs'].includes(key))
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid Snippet cache policy');
  }

  return { scope: RequestCacheScope.SharedPublic, maxAgeMs: raw.maxAgeMs };
}
