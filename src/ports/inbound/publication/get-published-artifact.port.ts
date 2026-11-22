import type { IPublishedArtifact } from '../../../domain/publication/published-artifact.js';

export interface IGetPublishedArtifactInput {
  readonly siteId: string;
  /** Null is only for legacy unqualified asset URLs from previously activated releases. */
  readonly releaseId: string | null;
  readonly path: string;
  /** Inspect existence and metadata without reading content or calculating content-derived headers. */
  readonly metadataOnly?: boolean;
}

export interface IGetPublishedArtifact {
  execute(input: IGetPublishedArtifactInput): Promise<IPublishedArtifact | null>;
}
