import { createHash } from 'node:crypto';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';

import { readDumpRecords, writeDumpRecords } from '../../backup/files/dump-archive.js';
import { child, treeRecords } from '../../backup/files/dump-files.js';

export const maximumAddonArchiveBytes = 64 * 1024 ** 2;

const maximumExpandedBytes = 256 * 1024 ** 2;

const maximumEntries = 4096;

export async function packAddonArchive(directory: string, filename: string): Promise<void> {
  await writeDumpRecords(filename, (async function* () {
    yield { kind: 'addonPackage', format: 'zarya-addon-archive', version: 1 };
    yield* treeRecords(directory, 'package');
  })());
}

export async function extractAddonArchive(filename: string, directory: string): Promise<void> {
  if ((await stat(filename)).size > maximumAddonArchiveBytes) {
    throw new Error('Release package exceeds the compressed size limit');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const names = new Set<string>();
  let header = false;
  let files = 0;
  let total = 0;
  let active: { file: Awaited<ReturnType<typeof open>>;
    received: number;
    expected: number;
    hash: ReturnType<typeof createHash> } | null = null;

  try {
    for await (const record of readDumpRecords(filename, {
      expandedBytes: maximumExpandedBytes, recordBytes: 128 * 1024,
    })) {
      if (!header) {
        if (record.kind !== 'addonPackage' || record.format !== 'zarya-addon-archive' || record.version !== 1) {
          throw new Error('Expected a runtime package archive');
        }
        header = true;
        continue;
      }
      if (active) {
        if (
          record.kind === 'chunk'
          && typeof record.data === 'string'
          && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data)
        ) {
          const bytes = Buffer.from(record.data, 'base64');

          active.received += bytes.length;

          if (bytes.length > 65536 || active.received > active.expected) {
            throw new Error('Invalid package chunk size');
          }
          active.hash.update(bytes);
          await active.file.writeFile(bytes);
        } else if (
          record.kind === 'fileEnd'
          && active.received === active.expected
          && record.checksum === active.hash.digest('hex')
        ) {
          await active.file.close();
          active = null;
        } else {
          throw new Error('Invalid package file framing');
        }
        continue;
      }
      if (
        !['directory', 'file'].includes(String(record.kind))
        || record.area !== 'package'
        || typeof record.path !== 'string'
        || record.path.length > 2048
        || record.path.split('/').length > 16
      ) {
        throw new Error('Unexpected package record');
      }

      const name = record.path.normalize('NFC').toLowerCase();

      if (names.has(name) || names.size >= maximumEntries) {
        throw new Error('Duplicate or excessive package entries');
      }
      names.add(name);
      const target = child(directory, record.path);

      if (record.kind === 'directory') {
        await mkdir(target, { recursive: true, mode: 0o700 });
      } else {
        if (
          typeof record.size !== 'number'
          || !Number.isSafeInteger(record.size)
          || record.size < 0
          || record.size > maximumAddonArchiveBytes
          || files >= 2048
        ) {
          throw new Error('Invalid package file size/count');
        }
        total += record.size;
        files++;

        if (total > maximumExpandedBytes) {
          throw new Error('Expanded package exceeds its limit');
        }
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        active = {
          file: await open(target, 'wx', 0o600),
          received: 0,
          expected: record.size,
          hash: createHash('sha256'),
        };
      }
    }

    if (!header || active || !files || !names.has('addon.runtime.json')) {
      throw new Error('Incomplete runtime package');
    }
  } finally {
    await active?.file.close();
  }
}
