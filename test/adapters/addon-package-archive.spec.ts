import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeDumpRecords } from '../../src/adapters/outbound/backup/files/dump-archive.js';
import {
  extractAddonArchive, packAddonArchive,
} from '../../src/adapters/outbound/runtime/addons/addon-package-archive.js';

describe('portable release archive', () => {
  let root: string;

  beforeEach(async () => {
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/addon-archive-'));
  });
  afterEach(async () => {
    expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it('streams a multi-chunk package and preserves exact bytes', async () => {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    const archive = path.join(root, 'addon.runtime.gz');
    const bytes = Buffer.alloc(180000, 77);

    await mkdir(source);
    await writeFile(path.join(source, 'runtime.cjs'), bytes);
    await writeFile(path.join(source, 'addon.runtime.json'), '{}');
    await packAddonArchive(source, archive);
    await extractAddonArchive(archive, target);
    expect(await readFile(path.join(target, 'runtime.cjs'))).toEqual(bytes);
  });

  it.each(['../escape', '/escape', 'nested/../../escape', 'CON', 'nested\\escape'])(
    'rejects an unsafe package path %s', async (unsafe) => {
      const archive = path.join(root, 'bad.gz');

      await writeDumpRecords(archive, (async function* () {
        yield { kind: 'addonPackage', format: 'zarya-addon-archive', version: 1 };
        yield { kind: 'file', area: 'package', path: unsafe, size: 0 };
      })());
      await expect(extractAddonArchive(archive, path.join(root, 'target'))).rejects.toThrow();
    },
  );

  it('rejects truncated or mixed archives', async () => {
    const archive = path.join(root, 'bad.gz');

    await writeFile(archive, Buffer.from([31, 139, 8]));
    await expect(extractAddonArchive(archive, path.join(root, 'truncated'))).rejects.toThrow();
    await writeDumpRecords(path.join(root, 'mixed.gz'), (async function* () {
      yield { kind: 'addonPackage', format: 'zarya-addon-archive', version: 1 };
      yield { kind: 'document', collection: 'admin_users', bytes: 'private' };
    })());
    await expect(extractAddonArchive(path.join(root, 'mixed.gz'), path.join(root, 'mixed'))).rejects.toThrow();
  });

  it('rejects oversized declared files and excessive directory entries before writing payloads', async () => {
    const archive = path.join(root, 'large.gz');

    await writeDumpRecords(archive, (async function* () {
      yield { kind: 'addonPackage', format: 'zarya-addon-archive', version: 1 };
      yield { kind: 'file', area: 'package', path: 'huge', size: 65 * 1024 ** 2 };
    })());
    await expect(extractAddonArchive(archive, path.join(root, 'large'))).rejects.toThrow();
  });
});
