import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { FileSiteDumpStore } from '../../src/adapters/outbound/backup/files/site-dump-store.adapter.js';
import { DumpDatabase } from '../../src/adapters/outbound/backup/mongoose/dump-database.adapter.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';

describe('filesystem dump catalogue', () => {
  let root: string;
  const filename = '2026-10-29T12-00-00-000Z_11111111-1111-4111-8111-111111111111.jsonl.gz';

  beforeEach(async () => {
    root = await mkdtemp(path.resolve('.tmp/dump-store-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function store(): FileSiteDumpStore {
    return new FileSiteDumpStore({
      root: path.join(root, 'dumps'),
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
    }, new DumpDatabase(createConnection()));
  }

  it('retains unresolved delivery markers on bootstrap before probing another process identity', async () => {
    const directory = path.join(root, 'dumps', '.coordination');

    await mkdir(path.join(directory, '.deliveries'), { recursive: true });
    await writeFile(path.join(directory, '.deliveries', 'site-1'), 'Unknown delivery');
    await writeFile(path.join(directory, '.operation.lock'), '2147483647');
    await expect(store().recover()).rejects.toThrow('Unresolved external delivery');
    expect(await readFile(path.join(directory, '.operation.lock'), 'utf8')).toBe('2147483647');
  });

  it('lists regular archives from fs, ignores partial files, and quietly drops removed files on refresh', async () => {
    const directory = path.join(root, 'dumps', 'site-1');

    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), 'gzip bytes');
    await writeFile(path.join(directory, 'partial.tmp'), 'partial');
    expect(await store().list('site-1')).toEqual([{
      type: SiteDumpType.Unknown, filename, byteSize: 10, createdAt: new Date('2026-10-29T12:00:00Z'),
    }]);
    expect(await store().list('site-2')).toEqual([]);
    await rm(path.join(directory, filename));
    expect(await store().list('site-1')).toEqual([]);
    await expect(store().open('site-1', filename)).rejects.toMatchObject({ code: 'NotFound' });
  });

  it('does not follow site directory links or archive links', async () => {
    await mkdir(path.join(root, 'dumps'));
    await mkdir(path.join(root, 'foreign'));
    await symlink(path.join(root, 'foreign'), path.join(root, 'dumps', 'site-1'), 'junction');
    await expect(store().list('site-1')).rejects.toThrow();
  });

  it('deletes only the requested regular archive and treats an already removed archive as deleted', async () => {
    const directory = path.join(root, 'dumps', 'site-1');

    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), 'gzip bytes');
    await writeFile(path.join(directory, 'retained.txt'), 'retained');
    await store().delete('site-1', filename);
    await store().delete('site-1', filename);
    expect(await store().list('site-1')).toEqual([]);
    await expect(store().delete('site-1', '../retained.txt')).rejects.toMatchObject({ code: 'Validation' });
  });
});
