import type { IActivePublication } from '../../../domain/publication/publication-release.js';

export interface IPublishSiteReleaseInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly expectedActiveReleaseId: string | null;
}

export interface IPublishSiteRelease {
  execute(input: IPublishSiteReleaseInput): Promise<IActivePublication>;
}
