import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

export const maximumDumpBytes = 16 * 1024 ** 3;

const maximumExpandedBytes = 64 * 1024 ** 3;

const maximumRecordBytes = 24 * 1024 ** 2;

export async function writeDumpRecords(filename: string,
  records: AsyncIterable<Record<string, unknown>>): Promise<void> {
  const hash = createHash('sha256');
  const lines = async function* (): AsyncGenerator<string> {
    for await (const record of records) {
      const line = JSON.stringify(record) + '\n';

      if (Buffer.byteLength(line) > maximumRecordBytes) {
        throw new Error('Dump record too large');
      }
      hash.update(line);
      yield line;
    }
    yield JSON.stringify({ kind: 'end', checksum: hash.digest('hex') }) + '\n';
  };

  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
}

export async function* readDumpRecords(filename: string,
  limits: { readonly expandedBytes?: number; readonly recordBytes?: number } = {}):
AsyncGenerator<Record<string, unknown>> {
  const expandedLimit = limits.expandedBytes ?? maximumExpandedBytes;
  const recordLimit = limits.recordBytes ?? maximumRecordBytes;
  const input = createReadStream(filename);
  const unzip = createGunzip();
  const pumping = pipeline(input, unzip).catch((error: unknown) => {
    unzip.destroy(error instanceof Error ? error : new Error('Invalid compressed dump'));
  });
  const hash = createHash('sha256');
  let pending = Buffer.alloc(0);
  let expanded = 0;
  let ended = false;

  try {
    for await (const chunk of unzip) {
      if (!Buffer.isBuffer(chunk)) {
        throw new Error('Invalid compressed bytes');
      }

      const bytes = chunk;

      expanded += bytes.length;

      if (expanded > expandedLimit) {
        throw new Error('Expanded dump exceeds its limit');
      }
      pending = Buffer.concat([pending, bytes]);
      let end: number;

      while ((end = pending.indexOf(10)) >= 0) {
        if (ended || end > recordLimit) {
          throw new Error('Invalid dump framing');
        }

        const line = pending.subarray(0, end + 1);
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));

        pending = pending.subarray(end + 1);

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Invalid dump record');
        }

        const record = Object.fromEntries(Object.entries(value));

        if (record.kind === 'end') {
          if (record.checksum !== hash.digest('hex')) {
            throw new Error('Dump checksum mismatch');
          }
          ended = true;
        } else {
          hash.update(line);
          yield record;
        }
      }

      if (pending.length > recordLimit) {
        throw new Error('Dump record exceeds its limit');
      }
    }

    if (!ended || pending.length) {
      throw new Error('Incomplete dump');
    }
  } finally {
    input.destroy();
    unzip.destroy();
    await pumping;
  }
}
