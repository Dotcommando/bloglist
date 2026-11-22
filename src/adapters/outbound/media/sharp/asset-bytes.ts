import { createHash } from 'node:crypto';

import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';

export function assetBinary(bytes: Uint8Array, mimeType: string): IBinaryContent {
  return {
    bytes: (async function* () {
      yield bytes;
    })(),
    byteSize: bytes.byteLength,
    mimeType,
  };
}

export function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
