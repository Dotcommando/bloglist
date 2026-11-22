import type { IPublicationArtifact } from '../../../domain/publication/publication-artifact.js';

export interface IPublicationArtifactSourcePort {
  /** Selected paths verify only those contents; omitted paths verify the complete reusable publication. */
  readArtifacts(siteId: string, releaseId: string, paths?: readonly string[]): Promise<readonly IPublicationArtifact[]>;
}
