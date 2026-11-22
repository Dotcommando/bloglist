import { OldUrlAction } from '../../src/domain/routing/old-url-action.enum.js';
import { RoutingConflictError } from '../../src/domain/routing/routing-conflict.error.js';
import { type IUrlState, Url } from '../../src/domain/routing/url.js';
import type { IUrlHistoryEntry } from '../../src/domain/routing/url-history-entry.js';
import { UrlKind } from '../../src/domain/routing/url-kind.enum.js';
import type { IChangePageUrlPersistence, IUrlRepository } from '../../src/ports/outbound/routing/url.repository.js';
import { instant } from './sites.js';

export function urlFixture(changes: Partial<IUrlState> = {}): Url {
  return new Url({
    urlId: 'url-old',
    mark: 'OldAddress',
    siteId: 'site-1',
    parentUrlId: null,
    segment: 'old',
    path: '/games/old/',
    kind: UrlKind.PAGE,
    pageId: 'page-1',
    redirectTargetUrlId: null,
    redirectStatus: null,
    firstPublishedAt: instant,
    createdAt: instant,
    updatedAt: instant,
    ...changes,
  });
}

export function urlInput(): { siteId: string;
  pageId: string;
  mark: string;
  parentUrlId: string | null;
  segment: string;
  path: string } {
  return {
    siteId: 'site-1',
    pageId: 'page-1',
    mark: 'NewAddress',
    parentUrlId: null,
    segment: 'new',
    path: '/games/new/',
  };
}

export function routingValues(): { nextUrlId(): string; nextUrlMark(): string; currentInstant(): Date } {
  let id = 0;
  let mark = 0;

  return {
    nextUrlId: () => `url-new-${++id}`,
    nextUrlMark: () => `Moved${++mark}`,
    currentInstant: () => new Date(instant),
  };
}

export class FakeUrlRepository implements IUrlRepository {
  readonly records = new Map<string, Url>();
  readonly history = new Map<string, IUrlHistoryEntry[]>();

  async findById(urlId: string): Promise<Url | null> {
    const url = this.records.get(urlId);

    return url ? new Url(url.toState()) : null;
  }

  async findByMark(mark: string): Promise<Url | null> {
    return this.find((url) => url.mark.toLowerCase() === mark.toLowerCase());
  }

  async findByPath(siteId: string, path: string): Promise<Url | null> {
    return this.find((url) => url.siteId === siteId && url.path === path);
  }

  async findCurrentByPage(pageId: string): Promise<Url | null> {
    return this.find((url) => url.kind === UrlKind.PAGE && url.pageId === pageId);
  }

  async findChildren(parentUrlId: string): Promise<Url[]> {
    return [...this.records.values()].filter((url) => url.parentUrlId === parentUrlId)
      .map((url) => new Url(url.toState()));
  }

  async save(url: Url): Promise<Url> {
    this.assertUnique(url, this.records);
    this.records.set(url.urlId, new Url(url.toState()));

    return new Url(url.toState());
  }

  async getHistory(urlId: string): Promise<IUrlHistoryEntry[]> {
    return structuredClone(this.history.get(urlId) ?? []);
  }

  async changePageUrl(change: IChangePageUrlPersistence): Promise<void> {
    if (change.graphChange) {
      const current = [...this.records.values()].filter((url) => url.siteId === change.previousUrl.siteId);

      if (JSON.stringify(current.map((url) => url.toState())) !== JSON.stringify(change.graphChange.previous)) {
        throw new RoutingConflictError('Stale graph');
      }

      for (const url of current) {
        this.records.delete(url.urlId);

        if (!change.graphChange.next.some((next) => next.urlId === url.urlId)) {
          this.history.delete(url.urlId);
        }
      }

      for (const url of change.graphChange.next) {
        this.records.set(url.urlId, new Url(url));
      }

      return;
    }

    const moves = [change, ...(change.descendants ?? [])];
    const next = new Map(this.records);
    const entries = structuredClone(this.history);

    for (const move of moves) {
      const previous = this.records.get(move.previousUrl.urlId);

      if (!previous || JSON.stringify(previous.toState()) !== JSON.stringify(move.previousUrl)) {
        throw new RoutingConflictError('Stale previous URL');
      }
      if (change.oldUrlAction === OldUrlAction.Delete) {
        next.delete(move.previousUrl.urlId);
        entries.delete(move.previousUrl.urlId);

        continue;
      }

      const redirect = new Url(move.previousUrl);

      redirect.redirectTo(move.newUrl.urlId, change.redirectStatus);
      next.set(redirect.urlId, redirect);
      const history = entries.get(redirect.urlId) ?? [];

      history.push({
        urlHistoryEntryId: `history-${history.length + 1}`,
        urlId: redirect.urlId,
        kind: move.previousUrl.kind,
        pageId: move.previousUrl.pageId,
        redirectTargetUrlId: move.previousUrl.redirectTargetUrlId,
        redirectStatus: move.previousUrl.redirectStatus,
        createdAt: change.changedAt,
      });
      entries.set(redirect.urlId, history);
    }

    for (const move of moves) {
      this.assertUnique(move.newUrl, next);
      next.set(move.newUrl.urlId, new Url(move.newUrl.toState()));
    }
    this.records.clear();

    for (const [key, url] of next) {
      this.records.set(key, url);
    }
    this.history.clear();

    for (const [key, rows] of entries) {
      this.history.set(key, rows);
    }
  }

  private find(predicate: (url: Url) => boolean): Url | null {
    const url = [...this.records.values()].find(predicate);

    return url ? new Url(url.toState()) : null;
  }

  private assertUnique(url: Url, records: ReadonlyMap<string, Url>): void {
    for (const other of records.values()) {
      if (
        other.urlId !== url.urlId
        && (other.mark.toLowerCase() === url.mark.toLowerCase()
        || (other.siteId === url.siteId
        && other.path === url.path)
        || (other.kind === UrlKind.PAGE
        && url.kind === UrlKind.PAGE
        && other.pageId === url.pageId))
      ) {
        throw new RoutingConflictError('Duplicate URL');
      }
    }
  }
}
