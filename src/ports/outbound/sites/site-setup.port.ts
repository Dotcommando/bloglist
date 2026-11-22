import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { Site } from '../../../domain/sites/site.js';

export interface ISiteSetupPort {
  complete(previous: Site, next: Site, hookChange: IHookCommitIntent): Promise<Site>;
}
