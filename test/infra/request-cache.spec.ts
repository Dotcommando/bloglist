import { readRequestCacheSettings } from '../../src/infra/publication/request-cache.settings.js';

it('validates finite Request cache memory budgets at bootstrap without enabling page policies', () => {
  expect(readRequestCacheSettings({})).toEqual({
    maxEntries: 256, maxBodyBytes: 2097152, maxTotalBytes: 33554432,
  });

  for (const invalid of ['0', '-1', '1.5', 'Infinity', 'many']) {
    expect(() => readRequestCacheSettings({ ZARYA_REQUEST_CACHE_MAX_ENTRIES: invalid })).toThrow();
  }
  expect(() => readRequestCacheSettings({
    ZARYA_REQUEST_CACHE_MAX_BODY_BYTES: '4096', ZARYA_REQUEST_CACHE_MAX_TOTAL_BYTES: '1024',
  })).toThrow();
});
