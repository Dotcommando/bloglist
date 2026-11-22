import { createHash } from 'node:crypto';

import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';

export function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function artifact(path: string, mimeType: string, value: string | Uint8Array,
  publicFile = true): IPublicationArtifact {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;

  return {
    path,
    mimeType,
    byteSize: bytes.byteLength,
    checksum: checksum(bytes),
    public: publicFile,
    content: {
      mimeType,
      byteSize: bytes.byteLength,
      bytes: {
        async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
          yield bytes;
        },
      },
    },
  };
}
