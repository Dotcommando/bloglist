import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IUrlState } from '../../../domain/routing/url.js';
import type { IUrlHistoryEntry } from '../../../domain/routing/url-history-entry.js';
import type { IVersionedUrl } from '../../../domain/routing/versioned-url.js';

export interface IUrlBehaviorChange {
  readonly hookChange?: IHookCommitIntent;
  readonly siteId: string;
  readonly expectedVersion: string;
  readonly previous: IUrlState;
  readonly next: IUrlState;
  readonly nextVersion: string;
  readonly history: IUrlHistoryEntry;
}

export interface IUrlBehaviorStorePort {
  findVersionedUrl(siteId: string, urlId: string): Promise<IVersionedUrl | null>;
  /** Guard captured state/version, ownership, uniqueness and redirect graph; commit history/version atomically. */
  commitBehaviorChange(change: IUrlBehaviorChange): Promise<void>;
}
