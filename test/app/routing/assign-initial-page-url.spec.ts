import { vi } from 'vitest';

import { AssignInitialPageUrlUseCase } from '../../../src/app/use-cases/routing/assign-initial-page-url.use-case.js';
import type { IPageReference } from '../../../src/domain/routing/page-reference.js';
import { RoutingConflictError } from '../../../src/domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../src/domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../src/domain/routing/routing-scope.error.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakeUrlRepository, routingValues, urlFixture, urlInput } from '../../support/routing.js';

export function assignmentSetup(): {
  urls: FakeUrlRepository;
  pages: { findPage: ReturnType<typeof vi.fn<(siteId: string, pageId: string) => Promise<IPageReference | null>>> };
  access: { assertCanAssignPageUrl: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>>;
    assertCanChangePageUrl: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>>;
    assertCanReadRouting: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>> };
  operation: AssignInitialPageUrlUseCase;
} {
  const urls = new FakeUrlRepository();
  const pages = {
    findPage: vi.fn<(siteId: string, pageId: string) => Promise<IPageReference | null>>()
      .mockResolvedValue({ siteId: 'site-1', pageId: 'page-1' }),
  };
  const access = {
    assertCanAssignPageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanChangePageUrl: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadRouting: vi.fn<(siteId: string) => Promise<void>>(),
  };

  return {
    urls,
    pages,
    access,
    operation: new AssignInitialPageUrlUseCase(urls, pages, routingValues(),
      access, fakeHookChanges),
  };
}

describe('AssignInitialPageUrlUseCase', () => {
  it('creates an owned PAGE address, using explicit scope, identity and time', async () => {
    const { urls, pages, access, operation } = assignmentSetup();
    const save = vi.spyOn(urls, 'save');
    const result = await operation.execute(urlInput());

    expect(pages.findPage).toHaveBeenCalledWith('site-1', 'page-1');
    expect(access.assertCanAssignPageUrl).toHaveBeenCalledWith('site-1');
    expect(save).toHaveBeenCalledOnce();
    expect(result.toState()).toMatchObject({
      urlId: 'url-new-1',
      pageId: 'page-1',
      kind: 'PAGE',
      path: '/games/new/',
      mark: 'NewAddress',
      redirectTargetUrlId: null,
    });
  });

  it('rejects missing or foreign page references', async () => {
    const { pages, operation } = assignmentSetup();

    pages.findPage.mockResolvedValueOnce(null);
    await expect(operation.execute(urlInput())).rejects.toBeInstanceOf(RoutingNotFoundError);
    pages.findPage.mockResolvedValueOnce({ siteId: 'foreign', pageId: 'page-1' });
    await expect(operation.execute(urlInput())).rejects.toBeInstanceOf(RoutingScopeError);
  });

  it('rejects a missing or foreign parent and an existing current address', async () => {
    const { urls, operation } = assignmentSetup();

    await expect(operation.execute({ ...urlInput(), parentUrlId: 'absent' }))
      .rejects.toBeInstanceOf(RoutingNotFoundError);
    await urls.save(urlFixture({ siteId: 'foreign' }));
    await expect(operation.execute({ ...urlInput(), parentUrlId: 'url-old' }))
      .rejects.toBeInstanceOf(RoutingScopeError);
    await expect(operation.execute(urlInput())).rejects.toBeInstanceOf(RoutingScopeError);
  });

  it('rejects a current page binding or occupied path without a partial write', async () => {
    const { urls, operation } = assignmentSetup();

    await urls.save(urlFixture());
    const save = vi.spyOn(urls, 'save');

    await expect(operation.execute(urlInput())).rejects.toBeInstanceOf(RoutingConflictError);
    expect(save).not.toHaveBeenCalled();
  });

  it('denies before reading and never retries uncertain saves', async () => {
    const { urls, pages, access, operation } = assignmentSetup();

    access.assertCanAssignPageUrl.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    await expect(operation.execute(urlInput())).rejects.toMatchObject({ code: 'Forbidden' });
    expect(pages.findPage).not.toHaveBeenCalled();
    const failure = new Error('Unknown outcome');
    const save = vi.spyOn(urls, 'save').mockRejectedValue(failure);

    await expect(operation.execute(urlInput())).rejects.toBe(failure);
    expect(save).toHaveBeenCalledOnce();
  });
});
