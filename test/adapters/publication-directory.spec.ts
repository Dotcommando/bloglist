import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PublicationDirectoryAdapter,
} from '../../src/adapters/outbound/publication/files/publication-directory.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';

describe('domain-owned publication directories', () => {
  it('names releases by the trusted primary domain and relocates on domain changes', async () => {
    const root = await mkdtemp(path.resolve('.tmp/publication-directory-'));
    let domain = 'Example.Test';
    const directories = new PublicationDirectoryAdapter(root, { primaryDomain: async () => domain });
    const release = { siteId: 'site', siteKey: 'SiteOpaque', releaseId: 'release' };

    try {
      await directories.withWrite(release, async (directory) => {
        await mkdir(directory);
        await writeFile(path.join(directory, 'value'), 'retained');
      });
      expect(await directories.resolve(release)).toBe(path.join(root, 'sites/example.test/release'));
      domain = 'other.test';
      await directories.synchronize('site');
      expect(await readFile(path.join(await directories.resolve(release), 'value'), 'utf8')).toBe('retained');
      await expect(access(path.join(root, 'sites/example.test'))).rejects.toThrow();
      await expect(access(path.join(root, 'sites/other.test/images'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('reads legacy releases and migrates complete verified files without changing identities', async () => {
    const root = await mkdtemp(path.resolve('.tmp/publication-legacy-'));
    const directories = new PublicationDirectoryAdapter(root, { primaryDomain: async () => 'example.test' });
    const file = artifact('index.html', 'text/html', 'retained');
    const release = {
      siteId: 'site',
      siteKey: 'SiteOpaque',
      releaseId: 'release',
      state: ReleaseState.Ready,
      createdAt: new Date(),
      completedAt: new Date(),
      failure: null,
      manifest: {
        routes: [],
        artifacts: [{
          path: file.path, mimeType: file.mimeType, byteSize: file.byteSize, checksum: file.checksum, public: true,
        }],
      },
    };
    const old = path.join(root, 'sites/SiteOpaque/release');

    try {
      await mkdir(path.join(old, 'public'), { recursive: true });
      await writeFile(path.join(old, 'public/index.html'), 'retained');
      await writeFile(path.join(old, 'manifest.json'), JSON.stringify(release.manifest));
      expect(await directories.resolve(release)).toBe(old);
      await mkdir(path.join(root, 'sites/example.test/release'));
      expect(await directories.resolve(release)).toBe(old);
      await directories.migrate(release);
      expect(await directories.resolve(release)).toBe(path.join(root, 'sites/example.test/release'));
      expect(await readFile(path.join(await directories.resolve(release), 'public/index.html'), 'utf8'))
        .toBe('retained');
      await expect(access(path.join(root, 'sites/SiteOpaque'))).rejects.toThrow();
      await directories.migrate(release);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects another site domain directory and corrupt legacy bytes without moving them', async () => {
    const root = await mkdtemp(path.resolve('.tmp/publication-owner-'));
    const owner = new PublicationDirectoryAdapter(root, { primaryDomain: async () => 'example.test' });

    try {
      await owner.synchronize('owner');
      await expect(owner.synchronize('foreign')).rejects.toThrow();
      const old = path.join(root, 'sites/Legacy/release');

      await mkdir(old, { recursive: true });
      const release = {
        siteId: 'owner',
        siteKey: 'Legacy',
        releaseId: 'release',
        state: ReleaseState.Ready,
        createdAt: new Date(),
        completedAt: new Date(),
        failure: null,
        manifest: { routes: [], artifacts: [] },
      };

      await writeFile(path.join(old, 'manifest.json'), '{}');
      await expect(owner.migrate(release)).rejects.toThrow();
      expect(await readFile(path.join(old, 'manifest.json'), 'utf8')).toBe('{}');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
