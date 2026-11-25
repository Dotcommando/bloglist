import type * as Fs from 'node:fs/promises';
import { type FileHandle, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  FileLibraryProjectionAdapter,
} from '../../src/adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { libraryFileFixture } from '../support/file-library.js';
import { binary } from '../support/media.js';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof Fs>();

  return { ...fs, mkdir: vi.fn(fs.mkdir), open: vi.fn(fs.open), rm: vi.fn(fs.rm) };
});

describe('named public image projection', () => {
  it('updates only the named outputs covered by a retryable change journal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-file-projection-delta-'));
    const read = vi.fn(async () => binary('original'));
    const projection = new FileLibraryProjectionAdapter(root, {
      read, assertOwned: vi.fn(), write: vi.fn(), delete: vi.fn(),
    }, { primaryDomain: async () => 'example.test' });
    const file = libraryFileFixture();
    const sibling = { ...file, fileId: 'sibling', name: 'sibling.png' };
    const library = { siteId: 'site-1', version: 'v1', folders: [], files: [file, sibling] };
    const publicRoot = path.join(root, 'example.test/images');
    const renamed = { ...file, name: 'renamed.png' };
    const next = { ...library, version: 'v2', files: [renamed, sibling] };
    const change = { fileIds: [file.fileId], removedPaths: ['images/photo.png'] };

    try {
      await projection.install(library, async () => true);
      read.mockReset().mockRejectedValueOnce(new Error('Storage unavailable'));
      await expect(projection.installChange(next, change, async () => true)).rejects.toThrow('Storage unavailable');
      expect(await readFile(path.join(publicRoot, 'photo.png'), 'utf8')).toBe('original');
      expect(await readFile(path.join(publicRoot, 'sibling.png'), 'utf8')).toBe('original');

      read.mockReset().mockImplementation(async () => binary('replacement'));
      await expect(projection.installChange(next, change, async () => true)).resolves.toBe(true);
      expect(read).toHaveBeenCalledTimes(1);
      await expect(projection.installChange(next, change, async () => true)).resolves.toBe(true);
      await expect(readFile(path.join(publicRoot, 'photo.png'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(publicRoot, 'renamed.png'), 'utf8')).toBe('replacement');
      expect(await readFile(path.join(publicRoot, 'sibling.png'), 'utf8')).toBe('original');

      read.mockClear();
      await expect(projection.installChange({ ...next, files: [sibling] }, {
        fileIds: [], removedPaths: ['images/renamed.png'],
      }, async () => true)).resolves.toBe(true);
      expect(read).not.toHaveBeenCalled();
      await expect(readFile(path.join(publicRoot, 'renamed.png'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('releases the projection lock when staging cannot be created and allows reconciliation retry', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-file-stage-failure-'));
    const native = await vi.importActual<typeof Fs>('node:fs/promises');
    const failure = Object.assign(new Error('Staging storage exhausted'), { code: 'ENOSPC' });
    let writer: FileHandle | undefined;
    const projection = new FileLibraryProjectionAdapter(root, {
      read: async () => binary('owned bytes'), assertOwned: vi.fn(), write: vi.fn(), delete: vi.fn(),
    }, { primaryDomain: async () => 'example.test' });
    const library = { siteId: 'site-1', version: 'v1', folders: [], files: [libraryFileFixture()] };

    vi.mocked(open).mockImplementation(async (...args) => {
      const handle = await native.open(...args);

      if (String(args[0]).endsWith(path.join('library-state', 'writer.lock'))) {
        writer = handle;
      }

      return handle;
    });
    vi.mocked(mkdir).mockImplementation(async (target, options) => {
      if (path.basename(String(target)).startsWith('stage-')) {
        throw failure;
      }

      return native.mkdir(target, options);
    });

    try {
      await expect(projection.install(library, async () => true)).rejects.toBe(failure);
      await expect(readFile(path.join(root, 'example.test/.private/library-state/writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
      vi.mocked(mkdir).mockImplementation(native.mkdir);
      await expect(projection.install(library, async () => true)).resolves.toBe(true);
      expect(await readFile(path.join(root, 'example.test/images/photo.png'), 'utf8')).toBe('owned bytes');
    } finally {
      vi.mocked(mkdir).mockImplementation(native.mkdir);
      vi.mocked(open).mockImplementation(native.open);

      if (writer && writer.fd !== -1) {
        await writer.close();
      }
      await rm(root, { recursive: true, force: true });
    }
  });
  it('preserves staging and cleanup failures while releasing the writer for a later retry', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-file-cleanup-failure-'));
    const native = await vi.importActual<typeof Fs>('node:fs/promises');
    const primary = Object.assign(new Error('Stage cannot be created'), { code: 'ENOSPC' });
    const cleanup = Object.assign(new Error('Stage removal failed'), { code: 'EPERM' });
    const projection = new FileLibraryProjectionAdapter(root, {
      read: async () => binary('owned bytes'), assertOwned: vi.fn(), write: vi.fn(), delete: vi.fn(),
    }, { primaryDomain: async () => 'example.test' });
    const library = { siteId: 'site-1', version: 'v1', folders: [], files: [libraryFileFixture()] };

    vi.mocked(mkdir).mockImplementation(async (target, options) => {
      if (path.basename(String(target)).startsWith('stage-')) {
        throw primary;
      }

      return native.mkdir(target, options);
    });
    vi.mocked(rm).mockImplementation(async (target, options) => {
      if (path.basename(String(target)).startsWith('stage-')) {
        throw cleanup;
      }
      await native.rm(target, options);
    });

    try {
      await expect(projection.install(library, async () => true)).rejects.toMatchObject({
        name: 'AggregateError', errors: [primary, cleanup],
      });
      await expect(readFile(path.join(root, 'example.test/.private/library-state/writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
      vi.mocked(mkdir).mockImplementation(native.mkdir);
      vi.mocked(rm).mockImplementation(native.rm);
      await expect(projection.install(library, async () => true)).resolves.toBe(true);
    } finally {
      vi.mocked(mkdir).mockImplementation(native.mkdir);
      vi.mocked(rm).mockImplementation(native.rm);
      await rm(root, { recursive: true, force: true });
    }
  });
  it('leaves current named bytes unchanged when the pending catalog is no longer current', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-file-fence-'));
    let bytes = 'current bytes';
    const read = vi.fn(async () => binary(bytes));
    const projection = new FileLibraryProjectionAdapter(root, {
      read, assertOwned: vi.fn(), write: vi.fn(), delete: vi.fn(),
    }, { primaryDomain: async () => 'example.test' });
    const file = libraryFileFixture();

    try {
      await projection.install({
        siteId: 'site-1',
        version: 'current',
        folders: [],
        files: [{ ...file, name: 'current.png' }],
      }, async () => true);
      bytes = 'stale bytes';
      read.mockClear();
      const current = vi.fn(async () => false);
      const applied = await projection.install({ siteId: 'site-1', version: 'obsolete', folders: [], files: [file] },
        current);

      expect(await readFile(path.join(root, 'example.test/images/current.png'), 'utf8')).toBe('current bytes');
      expect(current).toHaveBeenCalledOnce();
      expect(read).not.toHaveBeenCalled();
      expect(applied).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('creates folders, changes paths, replaces bytes and removes deleted output', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-file-projection-'));
    const storage = {
      read: vi.fn(async () => binary('original')),
      assertOwned: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
    };
    const projection = new FileLibraryProjectionAdapter(root, storage, { primaryDomain: async () => 'example.test' });
    const file = libraryFileFixture();
    const library = { siteId: 'site-1', version: 'v1', folders: [], files: [file] };

    try {
      await projection.install(library, async () => true);
      expect(await readFile(path.join(root, 'example.test/images/photo.png'), 'utf8')).toBe('original');
      const immutable = path.join(root, 'example.test/images/.objects/retained.webp');

      await mkdir(path.dirname(immutable), { recursive: true });
      await writeFile(immutable, 'retained immutable image');
      storage.read.mockImplementation(async () => binary('replacement'));
      await projection.install({
        ...library,
        version: 'v2',
        files: [{ ...file, name: 'renamed.png' }],
      }, async () => true);
      await expect(readFile(path.join(root, 'example.test/images/photo.png')))
        .rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(root, 'example.test/images/renamed.png'), 'utf8')).toBe('replacement');
      expect(await readFile(immutable, 'utf8')).toBe('retained immutable image');
      await projection.install({ ...library, version: 'v3', files: [] }, async () => true);
      await expect(readFile(path.join(root, 'example.test/images/renamed.png')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
