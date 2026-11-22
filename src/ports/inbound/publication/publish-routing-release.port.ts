import type { IActivePublication } from '../../../domain/publication/publication-release.js';

export interface IPublishRoutingRelease {
  execute(input: { siteId: string; actorId: string }): Promise<IActivePublication | null>;
}
