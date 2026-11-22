import {
  MemoryRequestDocumentCacheAdapter,
} from '../../src/adapters/outbound/publication/memory/request-document-cache.adapter.js';

describe('bounded in-process Request cache', () => {
  const document = { html: 'abc', inlineStyleHashes: ['hash'], pageId: 'p', releaseId: 'r' };

  it('evicts by entry count/LRU, purges site entries, and bounds actual metadata/body bytes', () => {
    const cache = new MemoryRequestDocumentCacheAdapter({ maxEntries: 2, maxBodyBytes: 1024, maxTotalBytes: 2048 });
    const put = (key: string, siteId = 'site'): void =>
      cache.put(key, { siteId, expiresAt: cache.now() + 1000, document });

    put('a');
    put('b', 'other');
    cache.get('a');
    put('c');
    expect(cache.get('b')).toBeNull();
    expect(cache.snapshot().entries).toBe(2);
    cache.purge('site');
    expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0 });
    cache.put('large', {
      siteId: 'site',
      expiresAt: cache.now() + 1000,
      document: { ...document, html: 'x'.repeat(1025) },
    });
    expect(cache.get('large')).toBeNull();
    expect(cache.digest({ a: 1 })).toHaveLength(64);
  });
  it('rejects invalid or incoherent budgets at bootstrap', () => {
    expect(() => new MemoryRequestDocumentCacheAdapter({ maxEntries: 0 })).toThrow();
    expect(() => new MemoryRequestDocumentCacheAdapter({ maxBodyBytes: 4096, maxTotalBytes: 1024 })).toThrow();
  });
});
