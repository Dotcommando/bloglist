import type { Mock } from 'vitest';

import { SearchUrlsUseCase } from '../../../src/app/use-cases/routing/search-urls.use-case.js';
import type { Url } from '../../../src/domain/routing/url.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import { type IUrlSuggestion, UrlSearchPurpose } from '../../../src/domain/routing/url-search.js';
import { urlFixture } from '../../support/routing.js';

function setup(): {
  access: { assertCanReadRouting: Mock<() => Promise<undefined>> };
  current: { findById: Mock<() => Promise<Url | null>> };
  search: { search: Mock<() => Promise<IUrlSuggestion[]>> };
  operation: SearchUrlsUseCase;
} {
  const access = { assertCanReadRouting: vi.fn(async () => undefined) };
  const current = { findById: vi.fn(async (): Promise<Url | null> => urlFixture()) };
  const search = { search: vi.fn(async () => [{ siteId: 'site-1', urlId: 'home', path: '/', kind: UrlKind.PAGE }]) };

  return { access, current, search, operation: new SearchUrlsUseCase(access, current, search) };
}

const input = {
  siteId: 'site-1',
  currentUrlId: 'url-old',
  purpose: UrlSearchPurpose.Parent,
  query: 'games',
  limit: 10,
  offset: 20,
};

describe('SearchUrls', () => {
  it('searches page destinations for a virtual folder without excluding one of its child URLs', async () => {
    const f = setup();

    await f.operation.execute({ ...input, currentUrlId: '', purpose: UrlSearchPurpose.Redirect });
    expect(f.current.findById).not.toHaveBeenCalled();
    expect(f.search.search).toHaveBeenCalledWith(expect.objectContaining({ excludeUrlId: '', pagesOnly: true }));
  });
  it('passes the requested page to the search port, excluding self and descendant paths for parents', async () => {
    const f = setup();

    expect(await f.operation.execute(input)).toEqual({
      siteId: 'site-1',
      items: [
        { siteId: 'site-1', urlId: 'home', path: '/', kind: UrlKind.PAGE },
      ],
    });
    expect(f.search.search).toHaveBeenCalledWith({
      siteId: 'site-1',
      query: 'games',
      limit: 10,
      offset: 20,
      excludeUrlId: 'url-old',
      excludePathPrefix: '/games/old/',
      pagesOnly: false,
    });
  });
  it('filters redirect destinations to pages before pagination without excluding descendant pages', async () => {
    const f = setup();

    await f.operation.execute({ ...input, purpose: UrlSearchPurpose.Redirect });
    expect(f.search.search).toHaveBeenCalledWith({
      siteId: 'site-1', query: 'games', limit: 10, offset: 20, excludeUrlId: 'url-old', pagesOnly: true,
    });
  });
  it('authorizes before reads and rejects missing or foreign current URLs and foreign suggestions', async () => {
    const f = setup();

    f.access.assertCanReadRouting.mockRejectedValueOnce(new Error('Denied'));
    await expect(f.operation.execute(input)).rejects.toThrow('Denied');
    expect(f.current.findById).not.toHaveBeenCalled();
    f.current.findById.mockResolvedValueOnce(null);
    await expect(f.operation.execute(input)).rejects.toThrow('URL not found');
    f.current.findById.mockResolvedValueOnce(urlFixture({ siteId: 'foreign' }));
    await expect(f.operation.execute(input)).rejects.toThrow();
    expect(f.search.search).not.toHaveBeenCalled();
    f.search.search.mockResolvedValueOnce([{ siteId: 'foreign', urlId: 'home', path: '/', kind: UrlKind.PAGE }]);
    await expect(f.operation.execute(input)).rejects.toThrow();
  });
  it.each([{ limit: 11 }, { limit: 0 }, { offset: -1 }, { offset: 0.5 }, { query: 'x'.repeat(2049) },
    { offset: Number.MAX_SAFE_INTEGER + 1 }])('rejects invalid search bounds: %o', async (invalid) => {
    const f = setup();

    await expect(f.operation.execute({ ...input, ...invalid })).rejects.toThrow();
    expect(f.search.search).not.toHaveBeenCalled();
  });
});
