import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';

export const FILE_CHUNK_BYTES = 64 * 1024;

export class BinaryFileLimitError extends Error {}

export interface IFileDigest {
  readonly byteSize: number;
  readonly checksum: string;
}

export interface IStagedFile extends IFileDigest {
  readonly filename: string;
  dispose(): Promise<void>;
}

export function fileContent(filename: string, byteSize: number, mimeType: string): IBinaryContent {
  return {
    byteSize,
    mimeType,
    bytes: {
      async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
        const stream = createReadStream(filename, { highWaterMark: FILE_CHUNK_BYTES });

        try {
          for await (const chunk of stream) {
            if (!(chunk instanceof Uint8Array)) {
              throw new Error('Invalid file chunk');
            }
            yield chunk;
          }
        } finally {
          stream.destroy();
        }
      },
    },
  };
}

export async function digestFile(filename: string): Promise<IFileDigest> {
  return digestContent(fileContent(filename, (await stat(filename)).size, 'application/octet-stream'));
}

export async function digestContent(content: IBinaryContent): Promise<IFileDigest> {
  const hash = createHash('sha256');
  let byteSize = 0;

  for await (const chunk of content.bytes) {
    hash.update(chunk);
    byteSize += chunk.byteLength;
  }

  return { byteSize, checksum: hash.digest('hex') };
}

export async function writeFileContent(filename: string, content: IBinaryContent,
  maximumBytes: number, exactSize = true): Promise<IFileDigest> {
  const file = await open(filename, 'wx', 0o600);
  const hash = createHash('sha256');
  let byteSize = 0;

  try {
    for await (const chunk of content.bytes) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Invalid binary chunk');
      }
      byteSize += chunk.byteLength;

      if (byteSize > maximumBytes) {
        throw new BinaryFileLimitError('File exceeds the byte limit');
      }
      if (exactSize && byteSize > content.byteSize) {
        throw new Error('File exceeds its declared size');
      }
      hash.update(chunk);
      await file.writeFile(chunk);
    }

    if (exactSize && byteSize !== content.byteSize) {
      throw new Error('Incomplete file');
    }

    await file.sync();

    return { byteSize, checksum: hash.digest('hex') };
  } finally {
    await file.close();
  }
}

export async function stageFile(content: IBinaryContent, maximumBytes: number): Promise<IStagedFile> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zarya-file-'));
  const filename = path.join(directory, 'content');
  const dispose = async (): Promise<void> => rm(directory, {
    recursive: true, force: true, maxRetries: 4, retryDelay: 25,
  });

  try {
    return { ...await writeFileContent(filename, content, maximumBytes, false), filename, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
