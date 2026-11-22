import { describe, expect, it, vi } from 'vitest';

import {
  GetPublishedPageUseCase,
  ListPageVersionsUseCase,
} from '../../src/app/use-cases/cms/get-published-page.use-case.js';
import type { IPageState } from '../../src/domain/pages/page.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { pageFixture } from '../support/pages.js';
import { instant } from '../support/sites.js';

describe('CMS published content selection', () => {
  const page: IPageState = {
    ...pageFixture('p', 's').toState(),
    title: 'Published',
    status: PageStatus.PUBLISHED,
    publishedAt: instant,
  };

  function fixture(): {
    readRelease: ReturnType<typeof vi.fn>;
    versions: ReturnType<typeof vi.fn>;
    access: { assertCanReadPage: ReturnType<typeof vi.fn> };
    get: GetPublishedPageUseCase;
    list: ListPageVersionsUseCase;
  } {
    const readRelease = vi.fn(async () => page);
    const versions = vi.fn(async () => [{ pageVersionId: 'v', page }]);
    const access = { assertCanReadPage: vi.fn(async () => {}) };
    const port = { readRelease, versions };

    return {
      readRelease,
      versions,
      access,
      get: new GetPublishedPageUseCase(access, port),
      list: new ListPageVersionsUseCase(access, port),
    };
  }
  it('selects active release once by default and forwards explicit release selection', async () => {
    const f = fixture();

    expect(await f.get.execute({ siteId: 's', pageId: 'p' })).toBe(page);
    expect(f.readRelease).toHaveBeenLastCalledWith('s', 'p', undefined);
    await f.get.execute({ siteId: 's', pageId: 'p', releaseId: 'r' });
    expect(f.readRelease).toHaveBeenLastCalledWith('s', 'p', 'r');
  });
  it('selects a stable retained version without reading a release or draft', async () => {
    const f = fixture();

    expect(await f.get.execute({ siteId: 's', pageId: 'p', pageVersionId: 'v' })).toBe(page);
    expect(await f.get.execute({ siteId: 's', pageId: 'p', pageVersionId: 'pruned' })).toBeNull();
    expect(f.readRelease).not.toHaveBeenCalled();
  });
  it('rejects ambiguous selectors and checks authorization before reading', async () => {
    const f = fixture();

    await expect(f.get.execute({ siteId: 's', pageId: 'p', releaseId: 'r', pageVersionId: 'v' })).rejects.toThrow();
    expect(f.versions).not.toHaveBeenCalled();
    f.access.assertCanReadPage.mockRejectedValueOnce(new Error('Denied'));
    await expect(f.list.execute({ siteId: 'other', pageId: 'p' })).rejects.toThrow('Denied');
    expect(f.versions).not.toHaveBeenCalled();
  });
});
