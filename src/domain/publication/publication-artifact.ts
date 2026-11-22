import type { IBinaryContent } from '../shared/binary-content.js';

export interface IArtifactMetadata {
  readonly path: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksum: string;
  readonly public: boolean;
}

export interface IPublicationArtifact extends IArtifactMetadata {
  readonly content: IBinaryContent;
}
