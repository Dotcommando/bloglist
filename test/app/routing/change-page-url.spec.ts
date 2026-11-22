import { vi } from 'vitest';

import { ChangePageUrlUseCase } from '../../../src/app/use-cases/routing/change-page-url.use-case.js';
import { OldUrlAction } from '../../../src/domain/routing/old-url-action.enum.js';
import { RoutingConflictError } from '../../../src/domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../src/domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../src/domain/routing/routing-scope.error.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import { ChildrenUrlAction } from '../../../src/domain/routing/url-move-options.js';
import { UrlRedirectStatus } from '../../../src/domain/routing/url-redirect-status.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakeUrlRepository, routingValues, urlFixture, urlInput } from '../../support/routing.js';

function setup(): { urls: FakeUrlRepository;
  operation: ChangePageUrlUseCase;
  access: { assertCanAssignPageUrl: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>>;
    assertCanChangePageUrl: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>>;
    assertCanReadRouting: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>> } } {
  const urls = new FakeUrlRepository();
  const access = {
    assertCanAssignPageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanChangePageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadRouting: vi.fn<(siteId: string) => Promise<void>>(),
  };
  const pages = { findPage: async (siteId: string, pageId: string) => ({ siteId, pageId }) };

  return {
    urls,
    access,
    operation: new ChangePageUrlUseCase(urls, pages, routingValues(), access, {
      readUrls: async (siteId) => [...urls.records.values()].filter((url) => url.siteId
        === siteId).map((url) => url.toState()),
    }, fakeHookChanges),
  };
}

const child = (): ReturnType<typeof urlFixture> => urlFixture({
  urlId: 'child',
  mark: 'Child',
  pageId: 'child-page',
  parentUrlId: 'url-old',
  segment: 'report',
  path: '/games/old/report/',
});

describe('ChangePageUrlUseCase', () => {
  it('saves only a changed parent without replacing the URL or creating a redirect', async () => {
    const { urls, operation } = setup();
    const original = urlFixture();
    const parent = urlFixture({ urlId: 'parent', mark: 'Parent', pageId: 'parent-page', path: '/' });

    await urls.save(original);
    await urls.save(parent);
    const result = await operation.execute({
      ...urlInput(),
      path: original.path,
      parentUrlId: parent.urlId,
      expectedUrlId: original.urlId,
      childrenAction: ChildrenUrlAction.Keep,
      redirectStatus: UrlRedirectStatus.HTTP_301,
    });

    expect(result.toState()).toMatchObject({
      ...original.toState(), parentUrlId: parent.urlId,
    });
    expect(urls.records.size).toBe(2);
    expect((await urls.findById(original.urlId))?.kind).toBe(UrlKind.PAGE);
  });
  it('rejects a cyclic parent-only edit without writing', async () => {
    const { urls, operation } = setup();
    const original = urlFixture();

    await urls.save(original);
    await urls.save(child());
    const commit = vi.spyOn(urls, 'changePageUrl');

    await expect(operation.execute({
      ...urlInput(), path: original.path, parentUrlId: 'child', redirectStatus: UrlRedirectStatus.HTTP_301,
    })).rejects.toBeInstanceOf(RoutingConflictError);
    expect(commit).not.toHaveBeenCalled();
  });
  it('promotes nested paths without requiring explicit parent references', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(urlFixture({ ...child().toState(), parentUrlId: null }));
    await operation.execute({
      ...urlInput(),
      oldUrlAction: OldUrlAction.Delete,
      childrenAction: ChildrenUrlAction.PromoteWithoutRedirect,
      redirectStatus: UrlRedirectStatus.HTTP_301,
    });

    expect((await urls.findByPath('site-1', '/games/report/'))?.pageId).toBe('child-page');
    expect(await urls.findByPath('site-1', '/games/old/report/')).toBeNull();
  });
  it('permanently removes an old leaf address and its history when Delete is explicitly selected', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    const result = await operation.execute({
      ...urlInput(),
      oldUrlAction: OldUrlAction.Delete,
      redirectStatus: UrlRedirectStatus.HTTP_301,
    });

    expect(result.pageId).toBe('page-1');
    expect(await urls.findById('url-old')).toBeNull();
    expect(urls.history.has('url-old')).toBe(false);
    expect((await urls.findCurrentByPage('page-1'))?.urlId).toBe(result.urlId);
  });
  it('rejects a stale editor address instead of moving the page again', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    const commit = vi.spyOn(urls, 'changePageUrl');

    await expect(operation.execute({
      ...urlInput(),
      expectedUrlId: 'previous-editor-url',
      redirectStatus: UrlRedirectStatus.HTTP_301,
    })).rejects.toBeInstanceOf(RoutingConflictError);
    expect(commit).not.toHaveBeenCalled();
  });
  it('defaults to a parent-only move and preserves child paths and parent IDs', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(child());
    const commit = vi.spyOn(urls, 'changePageUrl');
    const result = await operation.execute({ ...urlInput(), redirectStatus: UrlRedirectStatus.HTTP_301 });

    expect(result.urlId).toBe('url-new-1');
    expect((await urls.findById('url-old'))?.toState()).toMatchObject({
      kind: 'REDIRECT',
      redirectTargetUrlId: result.urlId,
      redirectStatus: 301,
    });
    expect((await urls.findById('child'))?.toState()).toEqual(child().toState());
    expect(commit).toHaveBeenCalledOnce();
    expect(await urls.getHistory('url-old')).toHaveLength(1);
  });

  it('moves the whole hierarchy with stable old redirects and remapped new parents', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(child());
    await urls.save(urlFixture({
      urlId: 'grand',
      mark: 'Grand',
      pageId: 'grand-page',
      parentUrlId: 'child',
      segment: 'photos',
      path: '/games/old/report/photos/',
    }));
    const commit = vi.spyOn(urls, 'changePageUrl');
    const result = await operation.execute({
      ...urlInput(),
      redirectStatus: UrlRedirectStatus.HTTP_308,
      moveSubtree: true,
    });
    const movedChild = await urls.findByPath('site-1', '/games/new/report/');
    const movedGrand = await urls.findByPath('site-1', '/games/new/report/photos/');

    expect(movedChild?.parentUrlId).toBe(result.urlId);
    expect(movedGrand?.parentUrlId).toBe(movedChild?.urlId);
    expect(movedChild?.pageId).toBe('child-page');
    expect((await urls.findById('child'))?.redirectTargetUrlId).toBe(movedChild?.urlId);
    expect((await urls.findById('grand'))?.redirectTargetUrlId).toBe(movedGrand?.urlId);
    expect(await urls.getHistory('child')).toHaveLength(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]?.[0].descendants).toHaveLength(2);
  });

  it('also relocates redirect descendants and remaps their internal targets', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(child());
    await urls.save(urlFixture({
      urlId: 'alias',
      mark: 'Alias',
      parentUrlId: 'url-old',
      pageId: null,
      kind: UrlKind.REDIRECT,
      redirectTargetUrlId: 'child',
      redirectStatus: UrlRedirectStatus.HTTP_301,
      path: '/games/old/alias/',
      segment: 'alias',
    }));
    await operation.execute({ ...urlInput(), redirectStatus: UrlRedirectStatus.HTTP_308, moveSubtree: true });
    const alias = await urls.findByPath('site-1', '/games/new/alias/');
    const target = await urls.findByPath('site-1', '/games/new/report/');

    expect(alias?.redirectTargetUrlId).toBe(target?.urlId);
    expect(alias?.redirectStatus).toBe(UrlRedirectStatus.HTTP_301);
  });

  it('rejects a subtree path outside the old prefix without calling commit', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(urlFixture({ ...child().toState(), path: '/unrelated/' }));
    const commit = vi.spyOn(urls, 'changePageUrl');

    await expect(operation.execute({
      ...urlInput(),
      redirectStatus: UrlRedirectStatus.HTTP_301,
      moveSubtree: true,
    })).rejects.toBeInstanceOf(RoutingConflictError);
    expect(commit).not.toHaveBeenCalled();
    expect((await urls.findById('url-old'))?.kind).toBe(UrlKind.PAGE);
  });

  it('rejects occupied destination paths anywhere in a subtree', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(child());
    await urls.save(urlFixture({
      urlId: 'occupied',
      mark: 'Occupied',
      pageId: 'another',
      path: '/games/new/report/',
    }));
    const commit = vi.spyOn(urls, 'changePageUrl');

    await expect(operation.execute({
      ...urlInput(),
      redirectStatus: UrlRedirectStatus.HTTP_301,
      moveSubtree: true,
    })).rejects.toBeInstanceOf(RoutingConflictError);
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a new parent inside the old subtree', async () => {
    const { urls, operation } = setup();

    await urls.save(urlFixture());
    await urls.save(child());
    await expect(operation.execute({
      ...urlInput(),
      parentUrlId: 'child',
      redirectStatus: UrlRedirectStatus.HTTP_301,
      moveSubtree: true,
    })).rejects.toBeInstanceOf(RoutingConflictError);
  });

  it('rejects missing current bindings and foreign/cyclic child results', async () => {
    const { urls, operation } = setup();
    const input = { ...urlInput(), redirectStatus: UrlRedirectStatus.HTTP_301, moveSubtree: true };

    await expect(operation.execute(input)).rejects.toBeInstanceOf(RoutingNotFoundError);
    await urls.save(urlFixture());
    const children = vi.spyOn(urls, 'findChildren').mockResolvedValueOnce([urlFixture()]);

    await expect(operation.execute(input)).rejects.toBeInstanceOf(RoutingConflictError);
    children.mockResolvedValueOnce([urlFixture({ ...child().toState(), siteId: 'foreign' })]);
    await expect(operation.execute(input)).rejects.toBeInstanceOf(RoutingScopeError);
  });

  it('denies before reading and never retries stale or uncertain commits', async () => {
    const { urls, operation, access } = setup();

    access.assertCanChangePageUrl.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    const read = vi.spyOn(urls, 'findCurrentByPage');
    const input = { ...urlInput(), redirectStatus: UrlRedirectStatus.HTTP_301 };

    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'Forbidden' });
    expect(read).not.toHaveBeenCalled();
    await urls.save(urlFixture());
    const failure = new Error('Unknown commit outcome');
    const commit = vi.spyOn(urls, 'changePageUrl').mockRejectedValue(failure);

    await expect(operation.execute(input)).rejects.toBe(failure);
    expect(commit).toHaveBeenCalledOnce();
  });
});
