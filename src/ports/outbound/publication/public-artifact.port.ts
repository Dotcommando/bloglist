import type { IPublishedArtifact } from '../../../domain/publication/published-artifact.js';

export interface IPublicArtifactPort {
  readPublicArtifact(siteId: string, releaseId: string, path: string,
    metadataOnly?: boolean): Promise<IPublishedArtifact | null>;
}

export interface ILegacyAssetLookupPort {
  findRelease(siteId: string, artifactPath: string): Promise<string | null>;
}
