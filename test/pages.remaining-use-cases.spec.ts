import { PageScopeService } from '../src/app/services/pages/page-scope.service.js';
import { ArchivePageUseCase } from '../src/app/use-cases/pages/archive-page.use-case.js';
import { GetPageUseCase } from '../src/app/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../src/app/use-cases/pages/list-pages.use-case.js';
import { Page } from '../src/domain/pages/page.js';
import type { IPageFilter } from '../src/domain/pages/page-filter.js';
import { PageNotFoundError } from '../src/domain/pages/page-not-found.error.js';
import { PageScopeError } from '../src/domain/pages/page-scope.error.js';
import { PageStatus } from '../src/domain/pages/page-status.enum.js';
import { PageType } from '../src/domain/pages/page-type.enum.js';
import { instant, pageState } from './domain.fixtures.js';
import { pageRepository } from './pages.fixtures.js';

const target = { siteId: 'site-1', pageId: 'page-1' };

describe('ArchivePageUseCase', () => {
  it.each([PageStatus.DRAFT, PageStatus.PUBLISHED, PageStatus.ARCHIVED])(
    'archives a %s page while preserving its content, relationships and lifecycle instants', async (status) => {
      const pages = pageRepository();
      const state = pageState({ status, publishedAt: instant(), clusterId: 'cluster-1', robotsIndex: false });
      const loaded = new Page(state);

      vi.mocked(pages.findById).mockResolvedValue(loaded);
      const saved = await new ArchivePageUseCase(pages, new PageScopeService(pages)).execute(target);

      expect(saved.toState()).toEqual({ ...state, status: PageStatus.ARCHIVED });
      expect(pages.findById).toHaveBeenCalledExactlyOnceWith('page-1');
      expect(pages.save).toHaveBeenCalledExactlyOnceWith(saved);
      expect(loaded.toState()).toEqual(state);
    },
  );

  it('preserves null publication time for a never-published draft', async () => {
    const pages = pageRepository();

    vi.mocked(pages.findById).mockResolvedValue(new Page(pageState()));
    const saved = await new ArchivePageUseCase(pages, new PageScopeService(pages)).execute(target);

    expect(saved.publishedAt).toBeNull();
    expect(saved.status).toBe(PageStatus.ARCHIVED);
  });

  it('rejects a missing page without writing', async () => {
    const pages = pageRepository();

    await expect(new ArchivePageUseCase(pages, new PageScopeService(pages)).execute(target))
      .rejects.toBeInstanceOf(PageNotFoundError);
    expect(pages.save).not.toHaveBeenCalled();
  });

  it('rejects another site before writing or mutating its page', async () => {
    const pages = pageRepository();
    const state = pageState({ siteId: 'site-2' });
    const loaded = new Page(state);

    vi.mocked(pages.findById).mockResolvedValue(loaded);
    await expect(new ArchivePageUseCase(pages, new PageScopeService(pages)).execute(target))
      .rejects.toBeInstanceOf(PageScopeError);
    expect(pages.save).not.toHaveBeenCalled();
    expect(loaded.toState()).toEqual(state);
  });

  it('returns the persisted result and propagates save failure without mutating the original', async () => {
    const pages = pageRepository();
    const loaded = new Page(pageState());
    const saved = new Page(pageState({ status: PageStatus.ARCHIVED, updatedAt: new Date('2026-02-01T00:00:00Z') }));
    const failure = new Error('Save failed');
    const archive = new ArchivePageUseCase(pages, new PageScopeService(pages));

    vi.mocked(pages.findById).mockResolvedValue(loaded);
    vi.mocked(pages.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(archive.execute(target)).resolves.toBe(saved);
    await expect(archive.execute(target)).rejects.toBe(failure);
    expect(pages.save).toHaveBeenCalledTimes(2);
    expect(loaded.toState()).toEqual(pageState());
  });

  it('propagates a read failure without writing', async () => {
    const pages = pageRepository();
    const failure = new Error('Read failed');

    vi.mocked(pages.findById).mockRejectedValue(failure);
    await expect(new ArchivePageUseCase(pages, new PageScopeService(pages)).execute(target)).rejects.toBe(failure);
    expect(pages.save).not.toHaveBeenCalled();
  });
});

describe('GetPageUseCase', () => {
  it.each([PageStatus.DRAFT, PageStatus.PUBLISHED, PageStatus.ARCHIVED])('returns an owned %s page', async (status) => {
    const pages = pageRepository();
    const page = new Page(pageState({ status, publishedAt: status === PageStatus.PUBLISHED ? instant() : null }));

    vi.mocked(pages.findById).mockResolvedValue(page);
    await expect(new GetPageUseCase(pages).execute(target)).resolves.toBe(page);
    expect(pages.findById).toHaveBeenCalledExactlyOnceWith('page-1');
    expect(pages.save).not.toHaveBeenCalled();
  });

  it('returns null for an absent page', async () => {
    await expect(new GetPageUseCase(pageRepository()).execute(target)).resolves.toBeNull();
  });

  it('rejects an out-of-site page', async () => {
    const pages = pageRepository();

    vi.mocked(pages.findById).mockResolvedValue(new Page(pageState({ siteId: 'site-2' })));
    await expect(new GetPageUseCase(pages).execute(target)).rejects.toBeInstanceOf(PageScopeError);
    expect(pages.save).not.toHaveBeenCalled();
  });

  it('propagates a repository failure', async () => {
    const pages = pageRepository();
    const failure = new Error('Read failed');

    vi.mocked(pages.findById).mockRejectedValue(failure);
    await expect(new GetPageUseCase(pages).execute(target)).rejects.toBe(failure);
  });
});

describe('ListPagesUseCase', () => {
  it('returns all site results without adding publication filters or truncation', async () => {
    const pages = pageRepository();
    const results = Array.from({ length: 150 }, (_, index) => new Page(pageState({
      pageId: `page-${index}`,
      status: index % 2 === 0 ? PageStatus.DRAFT : PageStatus.ARCHIVED,
    })));

    vi.mocked(pages.findBySite).mockResolvedValue(results);
    await expect(new ListPagesUseCase(pages).execute({ siteId: 'site-1' })).resolves.toBe(results);
    expect(pages.findBySite).toHaveBeenCalledExactlyOnceWith('site-1', undefined);
    expect(pages.findByCluster).not.toHaveBeenCalled();
    expect(pages.save).not.toHaveBeenCalled();
  });

  it.each<IPageFilter>([
    {},
    { clusterId: null },
    { clusterId: 'cluster-1', language: 'en', type: PageType.BLOG_LIST, status: PageStatus.PUBLISHED },
  ])('passes supported filters explicitly with the site scope: %j', async (filter) => {
    const pages = pageRepository();

    await expect(new ListPagesUseCase(pages).execute({ siteId: 'site-1', filter })).resolves.toEqual([]);
    expect(pages.findBySite).toHaveBeenCalledExactlyOnceWith('site-1', filter);
    expect(vi.mocked(pages.findBySite).mock.calls[0]?.[1]).not.toBe(filter);
  });

  it('ignores extra filter fields and prevents them from overriding site scope', async () => {
    const pages = pageRepository();
    const filter = { language: 'en', siteId: 'site-2', unknown: true };

    await new ListPagesUseCase(pages).execute({ siteId: 'site-1', filter });
    expect(pages.findBySite).toHaveBeenCalledExactlyOnceWith('site-1', { language: 'en' });
  });

  it('rejects mixed-site results instead of silently dropping another site from the returned array', async () => {
    const pages = pageRepository();

    vi.mocked(pages.findBySite).mockResolvedValue([
      new Page(pageState()), new Page(pageState({ pageId: 'page-2', siteId: 'site-2' })),
    ]);
    await expect(new ListPagesUseCase(pages).execute({ siteId: 'site-1' })).rejects.toBeInstanceOf(PageScopeError);
    expect(pages.save).not.toHaveBeenCalled();
  });

  it('propagates repository failures', async () => {
    const pages = pageRepository();
    const failure = new Error('List failed');

    vi.mocked(pages.findBySite).mockRejectedValue(failure);
    await expect(new ListPagesUseCase(pages).execute({ siteId: 'site-1' })).rejects.toBe(failure);
  });
});
