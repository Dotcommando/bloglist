import type { IMediaPathReplacement } from '../../../domain/media/media-reference-rewrite.policy.js';
import type { ISiteFavicon } from '../../../domain/media/site-favicon.js';
import type { IActivePublication } from '../../../domain/publication/publication-release.js';

export interface IPublishMediaAddressRelease {
  execute(input: { readonly siteId: string;
    readonly actorId: string;
    readonly favicon?: ISiteFavicon | null;
    readonly paths: readonly IMediaPathReplacement[] }): Promise<IActivePublication | null>;
}

export interface IApplyPublishedMediaAddresses {
  execute(input: {
    readonly siteId: string;
    readonly favicon?: ISiteFavicon | null;
    readonly paths: readonly IMediaPathReplacement[];
  }):
  Promise<IActivePublication | null>;
}
