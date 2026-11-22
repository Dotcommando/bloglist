import type { IMediaPathReplacement } from '../../../domain/media/media-reference-rewrite.policy.js';
import type { ISiteFavicon } from '../../../domain/media/site-favicon.js';
import type { IPublicationReleaseState } from '../../../domain/publication/publication-release.js';
import type { IBuiltPublication } from './frontend-build.port.js';

export interface IMediaAddressReleaseBuildInput {
  readonly siteId: string;
  readonly releaseId: string;
  readonly previous: IPublicationReleaseState;
  readonly favicon?: ISiteFavicon | null;
  readonly paths: readonly IMediaPathReplacement[];
  readonly origins: readonly string[];
}

export interface IMediaAddressReleaseBuild {
  build(input: IMediaAddressReleaseBuildInput): Promise<IBuiltPublication & { readonly changed: boolean }>;
}
