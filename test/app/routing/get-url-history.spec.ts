import { vi } from 'vitest';

import { GetUrlHistoryUseCase } from '../../../src/app/use-cases/routing/get-url-history.use-case.js';
import { RoutingNotFoundError } from '../../../src/domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../src/domain/routing/routing-scope.error.js';
import type { IUrlHistoryEntry } from '../../../src/domain/routing/url-history-entry.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { FakeUrlRepository, urlFixture } from '../../support/routing.js';
import { instant } from '../../support/sites.js';

describe('GetUrlHistoryUseCase', () => {
  const access = {
    assertCanAssignPageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanChangePageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadRouting: vi.fn<(siteId: string) => Promise<void>>(),
  };
  const row = (): IUrlHistoryEntry => ({
    urlHistoryEntryId: 'history-1',
    urlId: 'url-old',
    kind: UrlKind.PAGE,
    pageId: 'page-1',
    redirectTargetUrlId: null,
    redirectStatus: null,
    createdAt: new Date(instant),
  });

  beforeEach(() => vi.resetAllMocks());

  it('returns owned detached history ordered oldest first and an empty array for a fresh URL', async () => {
    const urls = new FakeUrlRepository();

    await urls.save(urlFixture());
    const operation = new GetUrlHistoryUseCase(urls, access);

    expect(await operation.execute({ siteId: 'site-1', urlId: 'url-old' })).toEqual([]);
    urls.history.set('url-old', [{
      ...row(),
      urlHistoryEntryId: 'history-2',
      createdAt: new Date('2026-10-24T11:00:00Z'),
    }, row()]);
    const result = await operation.execute({ siteId: 'site-1', urlId: 'url-old' });

    expect(result.map((entry) => entry.urlHistoryEntryId)).toEqual(['history-1', 'history-2']);
    result[0]?.createdAt.setTime(0);
    expect(urls.history.get('url-old')?.[1]?.createdAt).toEqual(instant);
  });

  it('requires the URL and its ownership before reading history', async () => {
    const urls = new FakeUrlRepository();
    const read = vi.spyOn(urls, 'getHistory');
    const operation = new GetUrlHistoryUseCase(urls, access);

    await expect(operation.execute({ siteId: 'site-1', urlId: 'missing' }))
      .rejects.toBeInstanceOf(RoutingNotFoundError);
    await urls.save(urlFixture({ siteId: 'foreign' }));
    await expect(operation.execute({ siteId: 'site-1', urlId: 'url-old' }))
      .rejects.toBeInstanceOf(RoutingScopeError);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects mixed URL IDs or duplicate history IDs instead of returning partial data', async () => {
    const urls = new FakeUrlRepository();

    await urls.save(urlFixture());
    urls.history.set('url-old', [row(), { ...row(), urlHistoryEntryId: 'history-2', urlId: 'foreign' }]);
    const operation = new GetUrlHistoryUseCase(urls, access);

    await expect(operation.execute({ siteId: 'site-1', urlId: 'url-old' }))
      .rejects.toBeInstanceOf(RoutingScopeError);
    urls.history.set('url-old', [row(), row()]);
    await expect(operation.execute({ siteId: 'site-1', urlId: 'url-old' })).rejects.toThrow();
  });

  it('denies before reading and preserves dependency errors', async () => {
    const urls = new FakeUrlRepository();
    const find = vi.spyOn(urls, 'findById');

    access.assertCanReadRouting.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    const operation = new GetUrlHistoryUseCase(urls, access);

    await expect(operation.execute({ siteId: 'site-1', urlId: 'url-old' }))
      .rejects.toMatchObject({ code: 'Forbidden' });
    expect(find).not.toHaveBeenCalled();
    await urls.save(urlFixture());
    const failure = new Error('Unavailable');

    vi.spyOn(urls, 'getHistory').mockRejectedValue(failure);
    await expect(operation.execute({ siteId: 'site-1', urlId: 'url-old' })).rejects.toBe(failure);
  });
});
