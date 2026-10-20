import type { IUrlState, Url } from '../../../domain/routing/url.js';
import type { IUrlHistoryEntry } from '../../../domain/routing/url-history-entry.js';
import type { UrlRedirectStatus } from '../../../domain/routing/url-redirect-status.enum.js';

export interface IUrlRepository {
  findById(urlId: string): Promise<Url | null>;
  /** Mark uniqueness is global and case-insensitive. */
  findByMark(mark: string): Promise<Url | null>;
  findByPath(siteId: string, path: string): Promise<Url | null>;
  findCurrentByPage(pageId: string): Promise<Url | null>;
  findChildren(parentUrlId: string): Promise<Url[]>;
  /** Enforce mark, site/path and current-PAGE uniqueness atomically, including concurrent creation. */
  save(url: Url): Promise<Url>;
  getHistory(urlId: string): Promise<IUrlHistoryEntry[]>;
  changePageUrl(change: IChangePageUrlPersistence): Promise<void>;
}

/**
 * All writes succeed together, or none do. A stale previousUrl must fail without writes.
 * Record its previous behavior in history, create newUrl and redirect the previous URL.
 * Enforce uniqueness during commit; expose business conflicts as RoutingConflictError.
 */
export interface IChangePageUrlPersistence {
  readonly previousUrl: IUrlState;
  readonly newUrl: Url;
  readonly redirectStatus: UrlRedirectStatus;
  readonly changedAt: Date;
}
