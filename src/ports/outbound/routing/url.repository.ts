import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { OldUrlAction } from '../../../domain/routing/old-url-action.enum.js';
import type { IUrlState, Url } from '../../../domain/routing/url.js';
import type { IUrlGraphChange } from '../../../domain/routing/url-graph-change.policy.js';
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
  save(url: Url, hookChange?: IHookCommitIntent): Promise<Url>;
  getHistory(urlId: string): Promise<IUrlHistoryEntry[]>;
  changePageUrl(change: IChangePageUrlPersistence): Promise<void>;
}

/**
 * All writes succeed together, or none do. A stale previousUrl must fail without writes.
 * Record its previous behavior in history, create newUrl and redirect the previous URL.
 * A graph change may instead retain the same identity/path while updating its parent only.
 * Enforce uniqueness during commit; expose business conflicts as RoutingConflictError.
 */
export interface IChangePageUrlPersistence {
  readonly hookChange?: IHookCommitIntent;
  readonly oldUrlAction?: OldUrlAction;
  /** Complete scoped capture and approved final graph for deletion, promotion and dependent redirects. */
  readonly graphChange?: IUrlGraphChange;
  readonly previousUrl: IUrlState;
  readonly newUrl: Url;
  readonly redirectStatus: UrlRedirectStatus;
  readonly changedAt: Date;
  /** When true, descendants is the complete captured subtree; reject concurrent membership/state changes. */
  readonly moveSubtree?: boolean;
  readonly descendants?: readonly IDescendantUrlMove[];
}

export interface IDescendantUrlMove {
  readonly previousUrl: IUrlState;
  readonly newUrl: Url;
}
