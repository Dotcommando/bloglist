import type { IPublicationReleaseState } from '../../../domain/publication/publication-release.js';
import type { IUrlState } from '../../../domain/routing/url.js';
import type { IBuiltPublication } from './frontend-build.port.js';

export interface IRoutingReleaseBuildInput {
  readonly siteId: string;
  readonly releaseId: string;
  readonly previous: IPublicationReleaseState;
  readonly urls: readonly IUrlState[];
  readonly publicOrigin: string | null;
}

export interface IRoutingReleaseBuildPort {
  build(input: IRoutingReleaseBuildInput): Promise<IBuiltPublication>;
}
