import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { Url } from '../../../domain/routing/url.js';
import type { IVirtualUrlSnapshot } from '../../../domain/routing/virtual-url.policy.js';

export interface IVirtualUrlStore {
  read(siteId: string): Promise<IVirtualUrlSnapshot>;
  /** Atomically recheck the snapshot, insert the URL and adopt branch roots; preserve all child URLs and order. */
  commit(expected: IVirtualUrlSnapshot, url: Url, childPageIds: readonly string[],
    hookChange?: IHookCommitIntent): Promise<void>;
}
