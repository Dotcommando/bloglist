import { PageUrlPreparationService } from '../src/app/services/routing/page-url-preparation.service.js';
import { AssignInitialPageUrlUseCase } from '../src/app/use-cases/routing/assign-initial-page-url.use-case.js';
import { ChangePageUrlUseCase } from '../src/app/use-cases/routing/change-page-url.use-case.js';
import { FindUrlByPathUseCase } from '../src/app/use-cases/routing/find-url-by-path.use-case.js';
import { GetUrlHistoryUseCase } from '../src/app/use-cases/routing/get-url-history.use-case.js';
import { RoutingConflictError } from '../src/domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../src/domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../src/domain/routing/routing-scope.error.js';
import { Url } from '../src/domain/routing/url.js';
import type { IUrlHistoryEntry } from '../src/domain/routing/url-history-entry.js';
import { UrlKind } from '../src/domain/routing/url-kind.enum.js';
import { UrlRedirectStatus } from '../src/domain/routing/url-redirect-status.enum.js';
import type { IChangePageUrlInput } from '../src/ports/inbound/routing/change-page-url.port.js';
import type { IPageLookupPort } from '../src/ports/outbound/routing/page-lookup.port.js';
import type { IUrlRepository } from '../src/ports/outbound/routing/url.repository.js';
import { instant, urlState } from './domain.fixtures.js';
import { pageLookup, urlRepository } from './routing.fixtures.js';

const creationValues = {
  nextUrlId: (): string => 'url-new',
  currentInstant: (): Date => new Date('2026-02-20T03:04:05.000Z'),
};

function changeInput(overrides: Partial<IChangePageUrlInput> = {}): IChangePageUrlInput {
  return {
    siteId: 'site-1',
    pageId: 'page-1',
    mark: 'NewWoodUrl',
    parentUrlId: null,
    segment: 'new-wood',
    path: '/new-wood/',
    redirectStatus: UrlRedirectStatus.HTTP_301,
    ...overrides,
  };
}

function historyEntry(): IUrlHistoryEntry {
  return {
    urlHistoryEntryId: 'history-1',
    urlId: 'url-1',
    kind: UrlKind.PAGE,
    pageId: 'page-1',
    redirectTargetUrlId: null,
    redirectStatus: null,
    createdAt: instant(),
  };
}

function preparation(urls: IUrlRepository, pages: IPageLookupPort = pageLookup()): PageUrlPreparationService {
  return new PageUrlPreparationService(urls, pages, creationValues);
}

describe.each([AssignInitialPageUrlUseCase, ChangePageUrlUseCase])('%s shared address requirements', (UseCase) => {
  it('rejects a missing page without any writes', async () => {
    const urls = urlRepository();
    const pages = pageLookup();

    vi.mocked(pages.findPage).mockResolvedValue(null);
    await expect(new UseCase(urls, preparation(urls, pages)).execute(changeInput()))
      .rejects.toBeInstanceOf(RoutingNotFoundError);
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('rejects a page belonging to another site before querying URL ownership', async () => {
    const urls = urlRepository();
    const pages = pageLookup();

    vi.mocked(pages.findPage).mockResolvedValue({ pageId: 'page-1', siteId: 'site-2' });
    await expect(new UseCase(urls, preparation(urls, pages)).execute(changeInput()))
      .rejects.toBeInstanceOf(RoutingScopeError);
    expect(urls.findByMark).not.toHaveBeenCalled();
    expect(urls.findCurrentByPage).not.toHaveBeenCalled();
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('rejects a missing parent URL', async () => {
    const urls = urlRepository();

    await expect(new UseCase(urls, preparation(urls)).execute(changeInput({ parentUrlId: 'parent' })))
      .rejects.toBeInstanceOf(RoutingNotFoundError);
    expect(urls.findById).toHaveBeenCalledExactlyOnceWith('parent');
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('rejects a parent URL belonging to another site', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findById).mockResolvedValue(new Url(urlState({ urlId: 'parent', siteId: 'site-2' })));
    await expect(new UseCase(urls, preparation(urls)).execute(changeInput({ parentUrlId: 'parent' })))
      .rejects.toBeInstanceOf(RoutingScopeError);
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it.each(['mark', 'path'])('rejects an occupied %s before any writes', async (field) => {
    const urls = urlRepository();
    const taken = new Url(urlState());

    if (field === 'mark') {
      vi.mocked(urls.findByMark).mockResolvedValue(taken);
    } else {
      vi.mocked(urls.findByPath).mockResolvedValue(taken);
    }

    await expect(new UseCase(urls, preparation(urls)).execute(changeInput()))
      .rejects.toBeInstanceOf(RoutingConflictError);
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it.each<Partial<IChangePageUrlInput>>([
    { path: '//other.example/wood/' },
    { path: '/wood/?secret=1' },
    { path: 'wood/' },
    { mark: 'invalid-mark' },
    { segment: ' ' },
    { parentUrlId: 'url-new' },
  ])('rejects invalid domain values before lookups: %j', async (overrides) => {
    const urls = urlRepository();
    const pages = pageLookup();

    await expect(new UseCase(urls, preparation(urls, pages)).execute(changeInput(overrides)))
      .rejects.toBeInstanceOf(RangeError);
    expect(pages.findPage).not.toHaveBeenCalled();
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('propagates a page lookup failure without writing', async () => {
    const urls = urlRepository();
    const pages = pageLookup();
    const failure = new Error('Page lookup unavailable');

    vi.mocked(pages.findPage).mockRejectedValue(failure);
    await expect(new UseCase(urls, preparation(urls, pages)).execute(changeInput())).rejects.toBe(failure);
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('rejects a current URL belonging to another site', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findCurrentByPage).mockResolvedValue(new Url(urlState({ siteId: 'site-2' })));
    await expect(new UseCase(urls, preparation(urls)).execute(changeInput())).rejects.toBeInstanceOf(RoutingScopeError);
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });
});

describe('AssignInitialPageUrlUseCase', () => {
  it('saves a new PAGE URL with generated identity and UTC lifecycle instants', async () => {
    const urls = urlRepository();
    const pages = pageLookup();
    const url = await new AssignInitialPageUrlUseCase(urls, preparation(urls, pages)).execute(changeInput());
    const at = creationValues.currentInstant();

    expect(url.toState()).toEqual(urlState({
      urlId: 'url-new',
      mark: 'NewWoodUrl',
      segment: 'new-wood',
      path: '/new-wood/',
      firstPublishedAt: at,
      createdAt: at,
      updatedAt: at,
    }));
    expect(pages.findPage).toHaveBeenCalledExactlyOnceWith('page-1');
    expect(urls.findByPath).toHaveBeenCalledExactlyOnceWith('site-1', '/new-wood/');
    expect(urls.findCurrentByPage).toHaveBeenCalledExactlyOnceWith('page-1');
    expect(urls.findByMark).toHaveBeenCalledExactlyOnceWith('NewWoodUrl');
    expect(urls.findById).not.toHaveBeenCalled();
    expect(urls.save).toHaveBeenCalledExactlyOnceWith(url);
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('accepts an existing parent from the same site without changing it', async () => {
    const urls = urlRepository();
    const parent = new Url(urlState({ urlId: 'parent' }));
    const assign = new AssignInitialPageUrlUseCase(urls, preparation(urls));

    vi.mocked(urls.findById).mockResolvedValue(parent);
    await expect(assign.execute(changeInput({ parentUrlId: 'parent' })))
      .resolves.toHaveProperty('parentUrlId', 'parent');
    expect(parent.toState()).toEqual(urlState({ urlId: 'parent' }));
  });

  it('rejects a page which already has a current URL', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findCurrentByPage).mockResolvedValue(new Url(urlState()));
    await expect(new AssignInitialPageUrlUseCase(urls, preparation(urls)).execute(changeInput()))
      .rejects.toBeInstanceOf(RoutingConflictError);
    expect(urls.save).not.toHaveBeenCalled();
  });

  it('returns the saved entity and propagates a concurrent uniqueness conflict without retries', async () => {
    const urls = urlRepository();
    const saved = new Url(urlState({ urlId: 'url-new', updatedAt: creationValues.currentInstant() }));
    const failure = new RoutingConflictError('Concurrent initial URL assignment');
    const assign = new AssignInitialPageUrlUseCase(urls, preparation(urls));

    vi.mocked(urls.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(assign.execute(changeInput())).resolves.toBe(saved);
    await expect(assign.execute(changeInput())).rejects.toBe(failure);
    expect(urls.save).toHaveBeenCalledTimes(2);
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });
});

describe('ChangePageUrlUseCase', () => {
  it('returns success only after the atomic operation acknowledges completion', async () => {
    const urls = urlRepository();
    let signalEntered = (): void => undefined;
    let acknowledgeCommit = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const commit = new Promise<void>((resolve) => {
      acknowledgeCommit = resolve;
    });
    let settled = false;

    vi.mocked(urls.findCurrentByPage).mockResolvedValue(new Url(urlState()));
    vi.mocked(urls.changePageUrl).mockImplementation(async () => {
      signalEntered();
      await commit;
    });
    const result = new ChangePageUrlUseCase(urls, preparation(urls)).execute(changeInput()).then((url) => {
      settled = true;

      return url;
    });

    await entered;
    expect(settled).toBe(false);
    acknowledgeCommit();
    await expect(result).resolves.toHaveProperty('urlId', 'url-new');
  });

  it.each([UrlRedirectStatus.HTTP_301, UrlRedirectStatus.HTTP_308])(
    'submits the expected previous state and new PAGE URL in one atomic call with redirect %s', async (status) => {
      const urls = urlRepository();
      const previous = new Url(urlState());
      const expected = previous.toState();
      const change = new ChangePageUrlUseCase(urls, preparation(urls));

      vi.mocked(urls.findCurrentByPage).mockResolvedValue(previous);
      const newUrl = await change.execute(changeInput({ redirectStatus: status }));

      expect(newUrl.kind).toBe(UrlKind.PAGE);
      expect(newUrl.urlId).toBe('url-new');
      expect(newUrl.pageId).toBe('page-1');
      expect(newUrl.path).toBe('/new-wood/');
      expect(newUrl.firstPublishedAt).toEqual(creationValues.currentInstant());
      expect(urls.changePageUrl).toHaveBeenCalledExactlyOnceWith({
        previousUrl: expected,
        newUrl,
        redirectStatus: status,
        changedAt: creationValues.currentInstant(),
      });
      expect(urls.save).not.toHaveBeenCalled();
      expect(previous.toState()).toEqual(expected);
      newUrl.firstPublishedAt.setTime(0);
      expect(previous.firstPublishedAt).toEqual(instant());
    },
  );

  it('rejects a page without a current URL', async () => {
    const urls = urlRepository();

    await expect(new ChangePageUrlUseCase(urls, preparation(urls)).execute(changeInput()))
      .rejects.toBeInstanceOf(RoutingNotFoundError);
    expect(urls.changePageUrl).not.toHaveBeenCalled();
    expect(urls.save).not.toHaveBeenCalled();
  });

  it.each([
    urlState({ pageId: 'page-2' }),
    urlState({
      kind: UrlKind.REDIRECT,
      pageId: null,
      redirectTargetUrlId: 'url-2',
      redirectStatus: UrlRedirectStatus.HTTP_301,
    }),
  ])('rejects an inconsistent current URL: %j', async (state) => {
    const urls = urlRepository();

    vi.mocked(urls.findCurrentByPage).mockResolvedValue(new Url(state));
    await expect(new ChangePageUrlUseCase(urls, preparation(urls)).execute(changeInput()))
      .rejects.toBeInstanceOf(RangeError);
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('rejects reuse of the previous identity before attempting a self-redirect', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findCurrentByPage).mockResolvedValue(new Url(urlState({ urlId: 'url-new' })));
    await expect(new ChangePageUrlUseCase(urls, preparation(urls)).execute(changeInput()))
      .rejects.toBeInstanceOf(RangeError);
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('rejects an unsupported redirect status at the domain boundary', async () => {
    const urls = urlRepository();
    const previous = new Url(urlState());
    const input = changeInput();

    // Represents an untyped caller; the use case still enforces the domain invariant.
    Object.assign(input, { redirectStatus: 302 });
    vi.mocked(urls.findCurrentByPage).mockResolvedValue(previous);
    await expect(new ChangePageUrlUseCase(urls, preparation(urls)).execute(input)).rejects.toBeInstanceOf(RangeError);
    expect(urls.changePageUrl).not.toHaveBeenCalled();
    expect(previous.toState()).toEqual(urlState());
  });

  it('propagates stale-write rejection without mutating loaded data or retrying', async () => {
    const urls = urlRepository();
    const previous = new Url(urlState());
    const failure = new Error('Stale previous URL');

    vi.mocked(urls.findCurrentByPage).mockResolvedValue(previous);
    vi.mocked(urls.changePageUrl).mockRejectedValue(failure);
    await expect(new ChangePageUrlUseCase(urls, preparation(urls)).execute(changeInput())).rejects.toBe(failure);
    expect(urls.changePageUrl).toHaveBeenCalledTimes(1);
    expect(urls.save).not.toHaveBeenCalled();
    expect(previous.toState()).toEqual(urlState());
  });
});

describe('GetUrlHistoryUseCase', () => {
  it('checks site ownership before returning complete detached history snapshots', async () => {
    const urls = urlRepository();
    const entries = [historyEntry(), { ...historyEntry(), urlHistoryEntryId: 'history-2' }];

    vi.mocked(urls.findById).mockResolvedValue(new Url(urlState()));
    vi.mocked(urls.getHistory).mockResolvedValue(entries);
    const history = await new GetUrlHistoryUseCase(urls).execute({ siteId: 'site-1', urlId: 'url-1' });

    expect(urls.findById).toHaveBeenCalledExactlyOnceWith('url-1');
    expect(urls.getHistory).toHaveBeenCalledExactlyOnceWith('url-1');
    expect(history).toEqual(entries);
    expect(history).not.toBe(entries);
    history[0]?.createdAt.setTime(0);
    history.pop();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.createdAt).toEqual(instant());
  });

  it('returns an empty history for an existing URL with no changes', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findById).mockResolvedValue(new Url(urlState()));
    await expect(new GetUrlHistoryUseCase(urls).execute({ siteId: 'site-1', urlId: 'url-1' })).resolves.toEqual([]);
  });

  it('rejects another site before reading its history', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findById).mockResolvedValue(new Url(urlState({ siteId: 'site-2' })));
    await expect(new GetUrlHistoryUseCase(urls).execute({ siteId: 'site-1', urlId: 'url-1' }))
      .rejects.toBeInstanceOf(RoutingScopeError);
    expect(urls.getHistory).not.toHaveBeenCalled();
  });

  it('rejects a missing URL before reading its history', async () => {
    const urls = urlRepository();

    await expect(new GetUrlHistoryUseCase(urls).execute({ siteId: 'site-1', urlId: 'missing' }))
      .rejects.toBeInstanceOf(RoutingNotFoundError);
    expect(urls.getHistory).not.toHaveBeenCalled();
  });

  it('propagates a history read failure', async () => {
    const urls = urlRepository();
    const failure = new Error('History unavailable');

    vi.mocked(urls.findById).mockResolvedValue(new Url(urlState()));
    vi.mocked(urls.getHistory).mockRejectedValue(failure);
    await expect(new GetUrlHistoryUseCase(urls).execute({ siteId: 'site-1', urlId: 'url-1' })).rejects.toBe(failure);
  });
});

describe('FindUrlByPathUseCase', () => {
  it('rejects an out-of-scope repository result', async () => {
    const urls = urlRepository();

    vi.mocked(urls.findByPath).mockResolvedValue(new Url(urlState({ siteId: 'site-2' })));
    await expect(new FindUrlByPathUseCase(urls).execute({ siteId: 'site-1', path: '/wood/' }))
      .rejects.toBeInstanceOf(RoutingScopeError);
  });
  it('scopes an exact path lookup to the requested site and returns null when absent', async () => {
    const urls = urlRepository();
    const find = new FindUrlByPathUseCase(urls);

    await expect(find.execute({ siteId: 'site-2', path: '/wood/' })).resolves.toBeNull();
    expect(urls.findByPath).toHaveBeenCalledExactlyOnceWith('site-2', '/wood/');
  });

  it.each([UrlKind.PAGE, UrlKind.REDIRECT])('returns stored %s behavior without resolving redirects', async (kind) => {
    const urls = urlRepository();
    const url = new Url(urlState(kind === UrlKind.PAGE ? {} : {
      kind,
      pageId: null,
      redirectTargetUrlId: 'url-2',
      redirectStatus: UrlRedirectStatus.HTTP_301,
    }));

    vi.mocked(urls.findByPath).mockResolvedValue(url);
    await expect(new FindUrlByPathUseCase(urls).execute({ siteId: 'site-1', path: '/wood/' })).resolves.toBe(url);
    expect(urls.save).not.toHaveBeenCalled();
    expect(urls.changePageUrl).not.toHaveBeenCalled();
  });

  it('propagates a repository failure', async () => {
    const urls = urlRepository();
    const failure = new Error('Lookup failed');

    vi.mocked(urls.findByPath).mockRejectedValue(failure);
    await expect(new FindUrlByPathUseCase(urls).execute({ siteId: 'site-1', path: '/wood/' })).rejects.toBe(failure);
  });
});
