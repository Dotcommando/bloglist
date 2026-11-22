import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { IAddonPackageManifest } from '../../src/adapters/outbound/runtime/addons/addon-package.types.js';
import { packAddonArchive } from '../../src/adapters/outbound/runtime/addons/addon-package-archive.js';
import {
  GitHubAddonPackageDelivery,
} from '../../src/adapters/outbound/runtime/addons/github-addon-package-delivery.adapter.js';

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof fs>(),
}));

describe('GitHub release delivery', () => {
  let root: string;
  let archive: Uint8Array<ArrayBuffer>;
  let manifest: IAddonPackageManifest;

  beforeEach(async () => {
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/github-addon-'));
    const source = path.join(root, 'source');

    await mkdir(source);
    manifest = {
      format: 'zarya-addon',
      version: 1,
      cmsVersion: '0.8.0',
      definition: {
        addonKey: 'synthetic',
        implementationVersion: '1.0.0',
        contractVersion: 1,
        configurationSchemaVersion: 1,
        adminComponentId: null,
        snippetIds: [],
        name: { en: 'Synthetic', ru: 'Synthetic' },
        description: { en: 'Test', ru: 'Test' },
      },
      collections: [],
      dependencies: {},
      files: {},
      serverEntry: 'server.cjs',
      adminEntry: null,
      styles: [],
    };
    await writeFile(path.join(source, 'addon.runtime.json'), JSON.stringify(manifest));
    await packAddonArchive(source, path.join(root, 'release.gz'));
    archive = new Uint8Array(await readFile(path.join(root, 'release.gz')));
  });

  afterEach(async () => {
    expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  function fixture(hostVersion = '0.8.0'): {
    fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
    registry: {
      validatePackage: ReturnType<typeof vi.fn<() => Promise<IAddonPackageManifest>>>;
      runtime: ReturnType<typeof vi.fn<() => null>>;
      install: ReturnType<typeof vi.fn<() => Promise<void>>>;
    };
    delivery: GitHubAddonPackageDelivery;
  } {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.endsWith('/releases/latest') || url.includes('/releases/tags/')) {
        return Response.json({
          tag_name: 'v1.0.0',
          draft: false,
          prerelease: false,
          assets: [{
            id: 42,
            name: 'addon.runtime.gz',
            state: 'uploaded',
            size: archive.byteLength,
            digest: 'sha256:' + createHash('sha256').update(archive).digest('hex'),
          }],
        });
      }
      if (url.includes('/commits/')) {
        return Response.json({ sha: 'a'.repeat(40) });
      }

      return new Response(archive, { status: 200 });
    });
    const registry = {
      validatePackage: vi.fn(async () => manifest),
      runtime: vi.fn(() => null),
      install: vi.fn(async () => {}),
    };
    const delivery = new GitHubAddonPackageDelivery(path.join(root, 'staging'), registry, hostVersion, fetcher);

    return { fetcher, registry, delivery };
  }

  it('pins the release/commit and checks package identity before activation', async () => {
    const f = fixture();
    const prepared = await f.delivery.prepare('https://github.com/example/synthetic', null);

    try {
      expect(prepared).toMatchObject({
        releaseTag: 'v1.0.0',
        sourceCommit: 'a'.repeat(40),
        cmsVersion: '0.8.0',
        addonKey: 'synthetic',
        artifactChecksum: createHash('sha256').update(archive).digest('hex'),
      });
      expect(f.registry.install).not.toHaveBeenCalled();
      await f.delivery.install(prepared.contentId);
      expect(f.registry.install).toHaveBeenCalledOnce();
    } finally {
      await f.delivery.discard(prepared.contentId);
    }
    expect(await readdir(path.join(root, 'staging'))).toEqual([]);
  });

  it('downloads a private release without forwarding the App token on a redirect', async () => {
    const f = fixture();
    const peer = f.fetcher.getMockImplementation()!;
    const credential = 'installation-token-for-this-repository';
    const issue = vi.fn(async () => credential);
    const base = 'https://api.github.com/repos/example/synthetic';
    const storage = 'https://release-assets.githubusercontent.com/asset';
    const delivery = new GitHubAddonPackageDelivery(path.join(root, 'private'), f.registry, '0.8.0', f.fetcher,
      { issue });

    f.fetcher.mockImplementation(async (input, init) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('Authorization');

      if (url === storage) {
        expect(authorization).toBeNull();

        return peer(input, init);
      }
      if (!authorization) {
        return new Response(null, { status: 404 });
      }

      expect(authorization).toBe('Bearer ' + credential);

      return url === base + '/releases/assets/42'
        ? new Response(null, { status: 302, headers: { Location: storage } }) : peer(input, init);
    });

    const prepared = await delivery.prepare('https://github.com/example/synthetic', null);

    await delivery.discard(prepared.contentId);
    expect(prepared.addonKey).toBe('synthetic');
    expect(issue).toHaveBeenCalledExactlyOnceWith('example/synthetic', expect.any(AbortSignal));
    expect(f.fetcher.mock.calls.map(([url]) => url)).toEqual([
      base + '/releases/latest', base, base + '/releases/latest',
      base + '/commits/v1.0.0', base + '/releases/assets/42', storage,
    ]);
  });

  it('does not need the configured GitHub App for public releases or an absent public release', async () => {
    const f = fixture();
    const issue = vi.fn(async () => {
      throw new Error('The GitHub App is unavailable');
    });
    const repository = 'https://github.com/example/synthetic';
    const api = 'https://api.github.com/repos/example/synthetic';
    const delivery = new GitHubAddonPackageDelivery(path.join(root, 'public'), f.registry, '0.8.0', f.fetcher,
      { issue });
    const result = await delivery.prepare(repository, null);

    await delivery.discard(result.contentId);
    f.fetcher.mockImplementation(async (input) => new Response(null, { status: String(input) === api ? 200 : 404 }));

    await expect(delivery.prepare(repository, null)).rejects.toMatchObject({ code: 'NotFound' });
    expect(issue).not.toHaveBeenCalled();
    expect(f.fetcher.mock.calls.every(([, init]) => !new Headers(init?.headers).has('Authorization'))).toBe(true);
  });

  it.each(['0.8.0', '0.9.0', '1.0.0'])('accepts the minimum CMS version on host %s', async (hostVersion) => {
    const f = fixture(hostVersion);
    const prepared = await f.delivery.prepare('https://github.com/example/synthetic', null);

    await f.delivery.discard(prepared.contentId);
    expect(prepared.cmsVersion).toBe(hostVersion);
  });

  it('rejects hosts older than the minimum CMS version', async () => {
    const f = fixture('0.7.9');

    await expect(f.delivery.prepare('https://github.com/example/synthetic', null))
      .rejects.toMatchObject({ code: 'Validation' });
  });

  it('retries failed private staging cleanup before preparing another package', async () => {
    const f = fixture();
    const first = await f.delivery.prepare('https://github.com/example/events', null);
    const staging = path.join(root, 'staging');
    const old = await fs.readdir(staging);
    const cleanup = Object.assign(new Error('Synthetic staging EACCES'), { code: 'EACCES' });
    const remove = vi.spyOn(fs, 'rm').mockRejectedValueOnce(cleanup);

    try {
      await expect(f.delivery.discard(first.contentId)).rejects.toBe(cleanup);
    } finally {
      remove.mockRestore();
    }
    const next = await f.delivery.prepare('https://github.com/example/events', null);

    try {
      expect(await fs.readdir(staging)).toHaveLength(1);
      await expect(fs.stat(path.join(staging, old[0]!))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await f.delivery.discard(next.contentId);
    }
    expect(await fs.readdir(staging)).toEqual([]);
  });

  it('rejects a second delivery without an unbounded queue', async () => {
    const f = fixture();
    const prepared = await f.delivery.prepare('https://github.com/example/synthetic', null);

    try {
      await expect(f.delivery.prepare('https://github.com/another/addon', null))
        .rejects.toMatchObject({ code: 'Conflict' });
    } finally {
      await f.delivery.discard(prepared.contentId);
    }
  });

  it('retries an exact tag rather than selecting a newer release', async () => {
    const f = fixture();
    const prepared = await f.delivery.prepare('https://github.com/example/synthetic', 'v1.0.0');

    await f.delivery.discard(prepared.contentId);
    expect(f.fetcher.mock.calls[0]?.[0]).toBe('https://api.github.com/repos/example/synthetic/releases/tags/v1.0.0');
  });

  it('rejects missing releases, ambiguous assets and prereleases before downloading code', async () => {
    for (const response of [
      new Response('', { status: 404 }),
      Response.json({ tag_name: 'v1.0.0', draft: false, prerelease: false, assets: [] }),
      Response.json({ tag_name: 'v1.0.0', draft: false, prerelease: true, assets: [] }),
    ]) {
      const f = fixture();

      f.fetcher.mockResolvedValueOnce(response);
      await expect(f.delivery.prepare('https://github.com/example/synthetic', null)).rejects.toThrow();
      expect(f.registry.install).not.toHaveBeenCalled();
    }
  });

  it('rejects incompatible CMS versions without executing code and cleans staging', async () => {
    const f = fixture();

    f.registry.validatePackage.mockResolvedValueOnce({ ...manifest, cmsVersion: '0.7.0' });
    await expect(f.delivery.prepare('https://github.com/example/synthetic', null))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(f.registry.install).not.toHaveBeenCalled();
    expect(await readdir(path.join(root, 'staging'))).toEqual([]);
  });

  it('rejects redirects to internal hosts', async () => {
    const f = fixture();

    f.fetcher.mockImplementation(async (url) => String(url).includes('/releases/assets/')
      ? new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
      : String(url).includes('/commits/') ? Response.json({ sha: 'a'.repeat(40) })
        : Response.json({
          tag_name: 'v1',
          draft: false,
          prerelease: false,
          assets: [{ id: 42, name: 'addon.runtime.gz', state: 'uploaded', size: 100 }],
        }));
    await expect(f.delivery.prepare('https://github.com/example/synthetic', null)).rejects.toThrow();
    expect(f.fetcher.mock.calls.every(([url]) => String(url).startsWith('https://api.github.com/'))).toBe(true);
  });

  it('rejects changed/truncated archive bytes and releases admission for retry', async () => {
    const f = fixture();

    f.fetcher.mockImplementationOnce(async () => Response.json({
      tag_name: 'v1',
      draft: false,
      prerelease: false,
      assets: [{ id: 42, name: 'addon.runtime.gz', state: 'uploaded', size: archive.byteLength + 1 }],
    }));
    await expect(f.delivery.prepare('https://github.com/example/synthetic', null)).rejects.toThrow();
    const prepared = await f.delivery.prepare('https://github.com/example/synthetic', null);

    await f.delivery.discard(prepared.contentId);
    expect(f.registry.install).not.toHaveBeenCalled();
  });
});
