import { vi } from 'vitest';

import { FindUrlByPathUseCase } from '../../../src/app/use-cases/routing/find-url-by-path.use-case.js';
import { RoutingScopeError } from '../../../src/domain/routing/routing-scope.error.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { FakeUrlRepository, urlFixture } from '../../support/routing.js';

describe('FindUrlByPathUseCase', () => {
  const access = {
    assertCanAssignPageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanChangePageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadRouting: vi.fn<(siteId: string) => Promise<void>>(),
  };

  beforeEach(() => vi.resetAllMocks());

  it('reads an exact owned working path without rewriting case or slashes', async () => {
    const urls = new FakeUrlRepository();

    await urls.save(urlFixture());
    const operation = new FindUrlByPathUseCase(urls, access);

    expect((await operation.execute({ siteId: 'site-1', path: '/games/old/' }))?.urlId).toBe('url-old');
    expect(await operation.execute({ siteId: 'site-1', path: '/games/old' })).toBeNull();
    expect(await operation.execute({ siteId: 'site-1', path: '/Games/old/' })).toBeNull();
    expect(await operation.execute({ siteId: 'foreign', path: '/games/old/' })).toBeNull();
  });

  it('rejects a mismatched returned site or path', async () => {
    const urls = new FakeUrlRepository();

    vi.spyOn(urls, 'findByPath').mockResolvedValue(urlFixture({ siteId: 'foreign' }));
    await expect(new FindUrlByPathUseCase(urls, access).execute({ siteId: 'site-1', path: '/games/old/' }))
      .rejects.toBeInstanceOf(RoutingScopeError);
  });

  it.each([
    'relative', '//example.test', '/game?x=1', '/game#x', '/game\\x',
  ])('rejects malformed path %j before querying', async (path) => {
    const urls = new FakeUrlRepository();
    const find = vi.spyOn(urls, 'findByPath');

    await expect(new FindUrlByPathUseCase(urls, access).execute({ siteId: 'site-1', path })).rejects.toThrow();
    expect(find).not.toHaveBeenCalled();
  });

  it('denies before querying and propagates read failures', async () => {
    const urls = new FakeUrlRepository();
    const failure = new Error('Unavailable');
    const find = vi.spyOn(urls, 'findByPath').mockRejectedValue(failure);
    const operation = new FindUrlByPathUseCase(urls, access);

    access.assertCanReadRouting.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    await expect(operation.execute({ siteId: 'site-1', path: '/' })).rejects.toMatchObject({ code: 'Forbidden' });
    expect(find).not.toHaveBeenCalled();
    await expect(operation.execute({ siteId: 'site-1', path: '/' })).rejects.toBe(failure);
  });
});
