import type { IBinaryContent } from '../shared/binary-content.js';
import type { IArtifactMetadata } from './publication-artifact.js';

export interface IPublishedArtifact {
  readonly siteId: string;
  readonly releaseId: string;
  readonly metadata: IArtifactMetadata;
  readonly content: IBinaryContent;
  readonly inlineStyleHashes: readonly string[];
}
