import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { readDumpRecords, writeDumpRecords } from '../../src/adapters/outbound/backup/files/dump-archive.js';

describe('streamed gzip site archive', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.resolve('.tmp/dump-codec-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round trips binary data and requires the final checksum', async () => {
    const filename = path.join(root, 'dump.gz');
    const records = [{ kind: 'header', siteId: 'site-1' }, { kind: 'chunk', data: 'AAECAw==' }];

    await writeDumpRecords(filename, (async function* () {
      yield* records;
    })());
    const restored = [];

    for await (const record of readDumpRecords(filename)) {
      restored.push(record);
    }
    expect(restored).toEqual(records);
    const text = gunzipSync(await readFile(filename)).toString();

    await writeFile(filename, gzipSync(text.replace('site-1', 'site-2')));
    await expect(async () => {
      for await (const record of readDumpRecords(filename)) {
        expect(record).toBeDefined();
      }
    })
      .rejects.toThrow();
    await writeFile(filename, gzipSync(text.split('\n').slice(0, -2).join('\n') + '\n'));
    await expect(async () => {
      for await (const record of readDumpRecords(filename)) {
        expect(record).toBeDefined();
      }
    })
      .rejects.toThrow();
  });
});
