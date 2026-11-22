import type { IPublicationArtifact } from '../../../domain/publication/publication-artifact.js';
import type { IPublicationReleaseState } from '../../../domain/publication/publication-release.js';

export interface IPublicationStorePort {
  /** Stage immutable files and verify hashes; staging never activates a release. */
  stage(release: IPublicationReleaseState, artifacts: readonly IPublicationArtifact[]): Promise<void>;
  read(siteId: string, releaseId: string, metadataOnly?: boolean): Promise<IPublicationReleaseState | null>;
}
