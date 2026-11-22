import {
  type IRequestCacheMemorySettings, validateRequestCacheMemorySettings,
} from '../../adapters/outbound/publication/memory/request-document-cache.adapter.js';

export function readRequestCacheSettings(environment: NodeJS.ProcessEnv): IRequestCacheMemorySettings {
  const number = (name: string, fallback: number): number => {
    const value = environment[name];

    if (value === undefined) {
      return fallback;
    }
    if (!/^[1-9][0-9]*$/.test(value)) {
      throw new RangeError('Invalid ' + name);
    }

    return Number(value);
  };

  return validateRequestCacheMemorySettings({
    maxEntries: number('ZARYA_REQUEST_CACHE_MAX_ENTRIES', 256),
    maxBodyBytes: number('ZARYA_REQUEST_CACHE_MAX_BODY_BYTES', 2097152),
    maxTotalBytes: number('ZARYA_REQUEST_CACHE_MAX_TOTAL_BYTES', 33554432),
  });
}
