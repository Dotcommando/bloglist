import type { Mock } from 'vitest';

import { GetUrlCatalogUseCase } from '../../../src/app/use-cases/routing/get-url-catalog.use-case.js';
import type { IUrlState } from '../../../src/domain/routing/url.js';
import type { IVersionedUrl } from '../../../src/domain/routing/versioned-url.js';
import { pageFixture } from '../../support/pages.js';
import { urlFixture } from '../../support/routing.js';
import { siteFixture } from '../../support/sites.js';

function setup(): {
  access: { assertCanReadRouting: Mock<() => Promise<undefined>> };
  routing: { readUrls: Mock<() => Promise<IUrlState[]>> };
  versions: { findVersionedUrl: Mock<() => Promise<IVersionedUrl | null>> };
  operation: GetUrlCatalogUseCase;
} {
  const access = { assertCanReadRouting: vi.fn(async () => undefined) };
  const routing = { readUrls: vi.fn(async () => [urlFixture().toState()]) };
  const versions = {
    findVersionedUrl: vi.fn(async (): Promise<IVersionedUrl | null> => ({
      url:
    urlFixture().toState(),
      version: 'v1',
    })),
  };
  const published = { readActive: vi.fn(async () => null) };
  const sites = { execute: vi.fn(async () => siteFixture()) };
  const pages = { execute: vi.fn(async () => [pageFixture()]) };

  return {
    access,
    routing,
    versions,
    operation: new GetUrlCatalogUseCase(access, sites, pages, routing, versions, published),
  };
}

describe('GetUrlCatalog', () => {
  it('returns scoped addresses, concurrency versions and page summaries without private content', async () => {
    const f = setup();
    const result = await f.operation.execute({ siteId: 'site-1' });

    expect(result).toMatchObject({ siteId: 'site-1', urls: [{ version: 'v1' }], published: null });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).not.toHaveProperty('contentMd');
    expect(f.access.assertCanReadRouting).toHaveBeenCalledWith('site-1');
  });
  it('authorizes before reading and rejects foreign source data and disappeared URLs', async () => {
    const f = setup();

    f.access.assertCanReadRouting.mockRejectedValueOnce(new Error('Denied'));
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow('Denied');
    expect(f.routing.readUrls).not.toHaveBeenCalled();
    f.routing.readUrls.mockResolvedValueOnce([urlFixture({ siteId: 'foreign' }).toState()]);
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    f.versions.findVersionedUrl.mockResolvedValueOnce(null);
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
  });
});
