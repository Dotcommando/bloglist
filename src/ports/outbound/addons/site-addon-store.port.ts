import type { ISiteAddonState } from '../../../domain/addons/site-addon.js';
import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';

export interface ISiteAddonStorePort {
  find(siteId: string, addonKey: string): Promise<ISiteAddonState | null>;
  list(siteId: string): Promise<readonly ISiteAddonState[]>;
  listEnabled(): Promise<readonly ISiteAddonState[]>;
  commit(next: ISiteAddonState, expectedVersion: string | null, hookChange?: IHookCommitIntent):
  Promise<ISiteAddonState>;
}
