import { RedirectUrlUseCase } from '../../../src/app/use-cases/routing/redirect-url.use-case.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import { UrlRedirectStatus } from '../../../src/domain/routing/url-redirect-status.enum.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { urlFixture } from '../../support/routing.js';
import { behaviorFixture } from '../../support/url-behavior.js';

describe('RedirectUrl', () => {
  const input = {
    siteId: 'site-1',
    actorId: 'operator',
    urlId: 'url-old',
    expectedVersion: 'v1',
    targetUrlId: 'target',
    redirectStatus: UrlRedirectStatus.HTTP_308,
  };

  it('changes only retained URL behavior with history and no publication gate', async () => {
    const f = behaviorFixture();

    f.urls.records.set('target', urlFixture({
      urlId: 'target',
      mark: 'Target',
      path: '/target',
      pageId: 'unpublished',
    }));
    const result = await new RedirectUrlUseCase(f.store, f.urls, f.values, f.access, fakeHookChanges).execute(input);

    expect(result.toState()).toMatchObject({
      urlId: 'url-old',
      path: '/games/old/',
      kind: 'REDIRECT',
      pageId: null,
      redirectTargetUrlId: 'target',
      redirectStatus: 308,
    });
    expect(f.urls.history.get('url-old')?.[0]).toMatchObject({ kind: 'PAGE', pageId: 'page-1' });
  });
  it('rejects self redirects, missing/foreign targets and cycles without writing', async () => {
    const f = behaviorFixture();
    const operation = new RedirectUrlUseCase(f.store, f.urls, f.values, f.access, fakeHookChanges);

    await expect(operation.execute(input)).rejects.toThrow();
    await expect(operation.execute({ ...input, targetUrlId: 'url-old' })).rejects.toThrow();
    f.urls.records.set('target', urlFixture({ urlId: 'target', mark: 'Target', siteId: 'foreign', path: '/target' }));
    await expect(operation.execute(input)).rejects.toThrow();
    f.urls.records.set('target', urlFixture({
      urlId: 'target',
      mark: 'Target',
      path: '/target',
      kind: UrlKind.REDIRECT,
      pageId: null,
      redirectTargetUrlId: 'url-old',
      redirectStatus: UrlRedirectStatus.HTTP_301,
    }));
    await expect(operation.execute(input)).rejects.toThrow();
    expect(f.store.commitBehaviorChange).not.toHaveBeenCalled();
  });
});
