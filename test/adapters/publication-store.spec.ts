import type * as FileSystem from 'node:fs/promises';
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { publicationModels } from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  PublicationDirectoryAdapter,
} from '../../src/adapters/outbound/publication/files/publication-directory.adapter.js';
import {
  FilePublicationStoreAdapter,
} from '../../src/adapters/outbound/publication/files/publication-store.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { PublicationRelease, ReleaseState } from '../../src/domain/publication/publication-release.js';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof FileSystem>();

  return { ...fs, rename: vi.fn(fs.rename), mkdir: vi.fn(fs.mkdir) };
});

describe('immutable publication staging', () => {
  it('removes its staging tree when preparing the public directory fails and permits a fresh retry', async () => {
    const root = await mkdtemp(path.resolve('.tmp/release-stage-failure-'));
    const native = await vi.importActual<typeof FileSystem>('node:fs/promises');
    const connection = createConnection();
    const models = publicationModels(connection);
    const file = artifact('index.html', 'text/html', 'Complete');
    const metadata = {
      path: file.path,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      checksum: file.checksum,
      public: file.public,
    };
    const release = new PublicationRelease({
      siteId: 'site',
      releaseId: 'release',
      state: ReleaseState.Ready,
      createdAt: new Date(0),
      completedAt: new Date(1),
      failure: null,
      manifest: { routes: [], artifacts: [metadata] },
    }).toState();
    const store = new FilePublicationStoreAdapter(root, models.releases, {
      primaryDomain: async () => 'example.test',
    });
    const insert = vi.spyOn(models.releases, 'insertOne').mockResolvedValue(new models.releases({ _id: 'release' }));
    const failure = Object.assign(new Error('Public staging unavailable'), { code: 'ENOSPC' });

    vi.mocked(mkdir).mockImplementation(async (target, options) => {
      const directory = String(target);

      if (path.basename(directory) === 'public' && path.basename(path.dirname(directory)).startsWith('.staging-')) {
        throw failure;
      }

      return native.mkdir(target, options);
    });

    try {
      await expect(store.stage(release, [file])).rejects.toBe(failure);
      const directory = path.join(root, 'sites/example.test');

      expect((await readdir(directory)).filter((name) => name.startsWith('.staging-'))).toEqual([]);
      expect(insert).not.toHaveBeenCalled();
      vi.mocked(mkdir).mockImplementation(native.mkdir);
      await store.stage(release, [file]);
      expect(await readFile(path.join(directory, 'release/public/index.html'), 'utf8')).toBe('Complete');
      expect(insert).toHaveBeenCalledOnce();
    } finally {
      vi.mocked(mkdir).mockImplementation(native.mkdir);
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it('coalesces only overlapping reads with identical ownership and verification level', async () => {
    const root = await mkdtemp(path.resolve('.tmp/coalesced-release-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const file = artifact('index.html', 'text/html', 'Complete');
    const release = new PublicationRelease({
      siteId: 'site',
      releaseId: 'release',
      state: ReleaseState.Ready,
      manifest: {
        routes: [],
        artifacts: [{
          path: file.path,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          checksum: file.checksum,
          public: true,
        }],
      },
      failure: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-01T00:00:00Z'),
    }).toState();
    const store = new FilePublicationStoreAdapter(root, models.releases, {
      primaryDomain: async () => 'example.test',
    });

    vi.spyOn(models.releases, 'insertOne').mockResolvedValue(new models.releases({ _id: 'release' }));

    try {
      await store.stage(release, [file]);
      let complete!: () => void;
      const gate = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const query = models.releases.findOne();
      const foreignQuery = models.releases.findOne();

      vi.spyOn(query.lean(), 'exec').mockImplementation(async () => {
        await gate;
        const { releaseId, ...record } = release;

        return new models.releases({ ...record, _id: releaseId }).toObject();
      });
      vi.spyOn(foreignQuery.lean(), 'exec').mockResolvedValue(null);
      const find = vi.spyOn(models.releases, 'findOne').mockImplementation((filter) =>
        filter && 'siteId' in filter && filter.siteId === 'site' ? query : foreignQuery);
      const first = store.read('site', 'release', true);
      const second = store.read('site', 'release', true);
      const full = store.read('site', 'release');
      const foreign = store.read('foreign', 'release', true);

      expect(find).toHaveBeenCalledTimes(3);
      complete();
      const [left, right, verified, missing] = await Promise.all([first, second, full, foreign]);

      expect(left).toEqual(release);
      expect(right).toEqual(release);
      expect(verified).toEqual(release);
      expect(missing).toBeNull();
      left!.createdAt.setUTCFullYear(2000);
      expect(right!.createdAt.getUTCFullYear()).toBe(2026);
      await store.read('site', 'release', true);
      expect(find).toHaveBeenCalledTimes(4);
      await writeFile(path.join(root, 'sites/example.test/release/public/index.html'), 'Corrupt');
      await expect(store.read('site', 'release')).rejects.toThrow('Corrupt release artifact');
    } finally {
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes failed overlapping reads so a later request can recover', async () => {
    const connection = createConnection();
    const models = publicationModels(connection);
    const store = new FilePublicationStoreAdapter('.tmp/unused-read-root', models.releases, {
      primaryDomain: async () => 'example.test',
    });
    const failure = new Error('Database unavailable');
    let reject!: (error: Error) => void;
    const pending = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    const query = models.releases.findOne();

    vi.spyOn(query.lean(), 'exec').mockReturnValueOnce(pending).mockResolvedValue(null);
    const find = vi.spyOn(models.releases, 'findOne').mockReturnValue(query);

    try {
      const first = store.read('site', 'release', true);
      const second = store.read('site', 'release', true);
      const outcomes = Promise.allSettled([first, second]);

      expect(find).toHaveBeenCalledOnce();
      reject(failure);
      expect((await outcomes).every(value => value.status === 'rejected' && value.reason === failure)).toBe(true);
      expect(await store.read('site', 'release', true)).toBeNull();
      expect(find).toHaveBeenCalledTimes(2);
    } finally {
      await connection.close();
    }
  });

  it('stages a large artifact without concatenating its full contents', async () => {
    const root = await mkdtemp(path.resolve('.tmp/stream-release-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const file = artifact('assets/large.css', 'text/css', Buffer.alloc(2 * 1024 * 1024, 65));
    const metadata = {
      path: file.path,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      checksum: file.checksum,
      public: file.public,
    };
    const release = new PublicationRelease({
      siteId: 'site',
      siteKey: 'demo',
      releaseId: 'release',
      state: ReleaseState.Ready,
      manifest: { routes: [], artifacts: [metadata] },
      failure: null,
      createdAt: new Date(),
      completedAt: new Date(),
    });

    vi.spyOn(models.releases, 'insertOne').mockResolvedValue(new models.releases({ _id: 'release' }));
    const concatenate = vi.spyOn(Buffer, 'concat');

    try {
      await new FilePublicationStoreAdapter(root, models.releases, { primaryDomain: async () => 'example.test' })
        .stage(release.toState(), [file]);
      expect(concatenate.mock.calls.every(([chunks]) =>
        chunks.reduce((size, chunk) => size + chunk.byteLength, 0) <= 64 * 1024)).toBe(true);
    } finally {
      concatenate.mockRestore();
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves explicitly empty TV projections in persisted release manifests', () => {
    const connection = createConnection();
    const model = publicationModels(connection).releases;
    const manifest = {
      routes: [],
      artifacts: [],
      publishedPages: [{
        siteId: 'site',
        pageId: 'page',
        urlId: 'url',
        parentUrlId: null,
        title: 'Page',
        language: 'en',
        path: '/',
        tv: {},
        tvValues: {},
      }],
    };

    expect(new model({ _id: 'release', siteId: 'site', manifest }).toObject().manifest).toEqual(manifest);
  });
  it('reads verified public and private outputs for reuse without exposing another site', async () => {
    const root = await mkdtemp(path.resolve('.tmp/reuse-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const files = [artifact('index.html', 'text/html', 'Home'),
      artifact('plans/page.json', 'application/json', '{}', false)];
    const release = new PublicationRelease({
      siteId: 'site',
      siteKey: 'demo',
      releaseId: 'release',
      state: ReleaseState.Ready,
      manifest: {
        routes: [],
        artifacts: files.map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
          ({ path, mimeType, byteSize, checksum, public: publicFile })),
      },
      failure: null,
      createdAt: new Date(),
      completedAt: new Date(),
    });
    const store = new FilePublicationStoreAdapter(root, models.releases, {
      primaryDomain: async () => 'example.test',
    });

    vi.spyOn(models.releases, 'insertOne').mockResolvedValue(new models.releases({ _id: 'release' }));
    vi.spyOn(store, 'read').mockImplementation(async (siteId) => siteId === 'site' ? release.toState() : null);

    try {
      await store.stage(release.toState(), files);
      expect((await store.readArtifacts('site', 'release')).map((file) => [file.path, file.public]))
        .toEqual([['index.html', true], ['plans/page.json', false]]);
      await expect(store.readArtifacts('foreign', 'release')).rejects.toThrow();
      await writeFile(path.join(root, 'sites/example.test/release/public/index.html'), 'Corrupt');
      await expect(store.readArtifacts('site', 'release')).rejects.toThrow();
      expect((await store.readArtifacts('site', 'release', ['plans/page.json'])).map((item) => item.path))
        .toEqual(['plans/page.json']);
      expect(store.read).toHaveBeenLastCalledWith('site', 'release', true);
    } finally {
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each(['EPERM', 'EBUSY'])('retries a transient %s rename without replaying metadata writes', async (code) => {
    const root = await mkdtemp(path.resolve('.tmp/rename-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const file = artifact('index.html', 'text/html', 'Complete');
    const release = new PublicationRelease({
      siteId: 'site',
      siteKey: 'demo',
      releaseId: 'release',
      state: ReleaseState.Staged,
      manifest: null,
      failure: null,
      createdAt: new Date(),
      completedAt: null,
    });

    release.complete({
      routes: [],
      artifacts: [{
        path: file.path,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        checksum: file.checksum,
        public: true,
      }],
    }, new Date());
    const insert = vi.spyOn(models.releases, 'insertOne').mockResolvedValue(new models.releases({ _id: 'release' }));

    await new PublicationDirectoryAdapter(root, { primaryDomain: async () => 'example.test' }).synchronize('site');
    vi.mocked(rename).mockClear();
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Temporary file lock'), { code }));

    try {
      await new FilePublicationStoreAdapter(root, models.releases, {
        primaryDomain: async () => 'example.test',
      }).stage(release.toState(), [file]);
      expect(vi.mocked(rename).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(insert).toHaveBeenCalledOnce();
      expect(await readFile(path.join(root, 'sites/example.test/release/public/index.html'), 'utf8')).toBe('Complete');
      const before = vi.mocked(rename).mock.calls.length;
      const locked = Object.assign(new Error('Persistent lock'), { code });

      for (let attempt = 0; attempt < 5; attempt++) {
        vi.mocked(rename).mockRejectedValueOnce(locked);
      }
      await expect(new FilePublicationStoreAdapter(root, models.releases, {
        primaryDomain: async () => 'example.test',
      }).stage(
        { ...release.toState(), releaseId: 'blocked' }, [file])).rejects.toBe(locked);
      expect(rename).toHaveBeenCalledTimes(before + 5);
      expect(insert).toHaveBeenCalledOnce();
    } finally {
      await connection.close();

      if ((await realpath(root)).startsWith(path.resolve('.tmp') + path.sep)) {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
  it('does not acknowledge corrupt artifact bytes or expose private artifacts', async () => {
    const root = await mkdtemp(path.resolve('.tmp/artifacts-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const insert = vi.spyOn(models.releases, 'insertOne');
    const release = new PublicationRelease({
      siteId: 'site-1',
      siteKey: 'demo',
      releaseId: 'release',
      state: ReleaseState.Staged,
      manifest: null,
      failure: null,
      createdAt: new Date(),
      completedAt: null,
    });
    const file = artifact('index.html', 'text/html', 'Hello');

    release.complete({
      routes: [],
      artifacts: [{
        path: file.path,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        checksum: file.checksum,
        public: true,
      }],
    }, new Date());

    try {
      await expect(new FilePublicationStoreAdapter(root, models.releases, {
        primaryDomain: async () => 'example.test',
      }).stage(release.toState(),
        [{ ...file, checksum: 'bad' }])).rejects.toThrow();
      expect(insert).not.toHaveBeenCalled();
    } finally {
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
