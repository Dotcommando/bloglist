import { vi } from 'vitest';

import { RebindUrlToPageUseCase } from '../../../src/app/use-cases/routing/rebind-url-to-page.use-case.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { urlFixture } from '../../support/routing.js';
import { behaviorFixture } from '../../support/url-behavior.js';

describe('RebindUrlToPage', () => {
  const input = {
    siteId: 'site-1',
    actorId: 'operator',
    urlId: 'url-old',
    expectedVersion: 'v1',
    replacementPageId: 'page-2',
  };

  it('preserves the address identity while recording its previous binding and a new version', async () => {
    const f = behaviorFixture();
    const result = await new RebindUrlToPageUseCase(f.store, f.urls, f.pages, f.values, f.access,
      fakeHookChanges).execute(input);

    expect(result.toState()).toMatchObject({
      ...urlFixture().toState(),
      pageId: 'page-2',
      updatedAt: f.values.currentInstant(),
    });
    expect(f.urls.history.get('url-old')).toEqual([expect.objectContaining({ pageId: 'page-1', kind: 'PAGE' })]);
    expect(f.store.commitBehaviorChange).toHaveBeenCalledOnce();
  });
  it('rejects occupied targets, stale versions, denied access and missing/foreign references', async () => {
    const f = behaviorFixture();
    const operation = new RebindUrlToPageUseCase(f.store, f.urls, f.pages, f.values, f.access, fakeHookChanges);

    await expect(operation.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(operation.execute({ ...input, expectedVersion: 'old' })).rejects.toThrow();
    await expect(operation.execute({ ...input, urlId: 'missing' })).rejects.toThrow();
    f.urls.records.set('other', urlFixture({ urlId: 'other', mark: 'Other', path: '/other', pageId: 'page-2' }));
    await expect(operation.execute(input)).rejects.toThrow();
    f.urls.records.delete('other');
    f.pages.findPage.mockResolvedValueOnce({ siteId: 'foreign', pageId: 'page-2' });
    await expect(operation.execute(input)).rejects.toThrow();
    vi.mocked(f.store.findVersionedUrl).mockResolvedValueOnce({
      url: urlFixture({ siteId: 'foreign' }).toState(),
      version: 'v1',
    });
    await expect(operation.execute(input)).rejects.toThrow();
    expect(f.store.commitBehaviorChange).not.toHaveBeenCalled();
  });
});
