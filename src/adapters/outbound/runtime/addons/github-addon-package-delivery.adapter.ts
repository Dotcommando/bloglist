import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { addonRepositoryUrl } from '../../../../domain/addons/addon-installation.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type {
  IAddonPackageDelivery, IPreparedAddonPackage,
} from '../../../../ports/outbound/addons/addon-package-delivery.port.js';
import { extractAddonArchive, maximumAddonArchiveBytes } from './addon-package-archive.js';
import { packageObject } from './addon-package-manifest.js';
import type { AddonPackageRegistry } from './addon-package-registry.js';
import { supportsCmsVersion } from './cms-version.js';
import { githubApiOrigin, readGitHubJson } from './github-api-response.js';

export interface IGitHubRepositoryTokens {
  issue(repository: string, signal: AbortSignal): Promise<string>;
}

const downloadHosts = new Set([
  'api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com',
]);

export class GitHubAddonPackageDelivery implements IAddonPackageDelivery {
  private busy = false;
  private pendingCleanup: string | null = null;
  private staged: { contentId: string; directory: string; packageDirectory: string } | null = null;
  private readonly root: string;

  constructor(root: string,
    private readonly packages: Pick<AddonPackageRegistry, 'validatePackage' | 'install' | 'runtime'>,
    private readonly cmsVersion: string, private readonly fetcher: typeof fetch = fetch,
    private readonly tokens?: IGitHubRepositoryTokens) {
    this.root = path.resolve(root);
  }

  installed(addonKey: string, runtimeDigest: string): boolean {
    return this.packages.runtime(addonKey)?.digest === runtimeDigest;
  }

  private async response(url: string, signal: AbortSignal, binary = false, token?: string): Promise<Response> {
    return this.fetcher(url, {
      redirect: 'manual',
      signal,
      headers: {
        Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
        'Accept-Encoding': 'identity',
        'User-Agent': 'CMS-Zarya/' + this.cmsVersion,
        'X-GitHub-Api-Version': '2026-03-10',
        ...(token && new URL(url).origin === githubApiOrigin ? { Authorization: 'Bearer ' + token } : {}),
      },
    });
  }

  private async json(url: string, signal: AbortSignal, token?: string): Promise<Record<string, unknown>> {
    const response = await this.response(url, signal, false, token);

    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new BusinessError(response.status === 404 ? BusinessErrorCode.NotFound : BusinessErrorCode.AddonUnavailable,
        'GitHub release metadata is unavailable');
    }

    return readGitHubJson(response.body);
  }

  private async release(api: string, repository: string, releaseTag: string | null, signal: AbortSignal): Promise<{
    release: Record<string, unknown>; token?: string;
  }> {
    const url = api + '/releases/' + (releaseTag === null ? 'latest' : 'tags/' + encodeURIComponent(releaseTag));

    try {
      return { release: await this.json(url, signal) };
    } catch (error) {
      if (!this.tokens || !(error instanceof BusinessError) || error.code !== BusinessErrorCode.NotFound) {
        throw error;
      }

      const visibility = await this.response(api, signal);

      await visibility.body?.cancel();

      if (visibility.status === 200) {
        throw error;
      }
      if (visibility.status !== 404) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'GitHub repository visibility is unavailable');
      }

      const token = await this.tokens.issue(repository, signal);

      return { release: await this.json(url, signal, token), token };
    }
  }

  private async download(url: string, filename: string, size: number, signal: AbortSignal,
    token?: string): Promise<string> {
    let response: Response | null = null;

    for (let redirects = 0; redirects <= 3; redirects++) {
      const destination = new URL(url);

      if (
        destination.protocol !== 'https:'
        || destination.port
        || destination.username
        || destination.password
        || !downloadHosts.has(destination.hostname)
      ) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Unapproved release download destination');
      }
      response = await this.response(destination.href, signal, true, redirects === 0 ? token : undefined);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get('location');

      await response.body?.cancel();

      if (!location || redirects === 3) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid release redirect');
      }
      url = new URL(location, destination).href;
      response = null;
    }

    if (response?.status !== 200 || !response.body) {
      await response?.body?.cancel();
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Release download failed');
    }

    const encoding = response.headers.get('content-encoding');
    const declared = response.headers.get('content-length');

    if (encoding && encoding !== 'identity' || declared !== null && Number(declared) !== size) {
      await response.body.cancel();
      throw new BusinessError(BusinessErrorCode.Validation, 'Unexpected release response size/encoding');
    }

    const body = response.body;
    const output = await open(filename, 'wx', 0o600).catch(async (error: unknown) => {
      await body.cancel();
      throw error;
    });
    const hash = createHash('sha256');
    let received = 0;

    try {
      for await (const chunk of response.body) {
        received += chunk.byteLength;

        if (received > size || received > maximumAddonArchiveBytes) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Release exceeds its download limit');
        }
        hash.update(chunk);
        await output.writeFile(chunk);
      }

      if (received !== size) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Incomplete release download');
      }

      return hash.digest('hex');
    } finally {
      await output.close();
    }
  }

  prepare(repositoryUrl: string, releaseTag: string | null): Promise<IPreparedAddonPackage> {
    return this.preparePackage(repositoryUrl, releaseTag, false);
  }

  async prepareUpdate<T>(repositoryUrl: string, prepare: (directory: string) => Promise<T>): Promise<T> {
    const candidate = await this.preparePackage(repositoryUrl, null, true);
    let result: T;

    try {
      result = await prepare(this.staged!.packageDirectory);
    } catch (error) {
      await this.discard(candidate.contentId).catch((cleanup: unknown) => {
        throw new AggregateError([error, cleanup], 'Update preparation and staging cleanup failed');
      });
      throw error;
    }
    await this.discard(candidate.contentId);

    return result;
  }

  private async preparePackage(repositoryUrl: string, releaseTag: string | null,
    allowUpdate: boolean): Promise<IPreparedAddonPackage> {
    const canonical = addonRepositoryUrl(repositoryUrl);

    if (this.busy) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Another add-on installation is in progress');
    }
    this.busy = true;
    let directory: string | null = null;

    try {
      if (this.pendingCleanup) {
        await this.remove(this.pendingCleanup);
        this.pendingCleanup = null;
      }
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(path.join(this.root, 'download-'));
      const repository = canonical.slice('https://github.com/'.length);
      const api = githubApiOrigin + '/repos/' + repository;
      const signal = AbortSignal.timeout(60000);
      const { release, token } = await this.release(api, repository, releaseTag, signal);
      const tag = release.tag_name;

      if (
        release.draft !== false
        || release.prerelease !== false
        || typeof tag !== 'string'
        || !tag
        || tag.length > 256
        || tag.split('').some((character) => character.charCodeAt(0) < 33)
        || releaseTag !== null
        && tag !== releaseTag
        || !Array.isArray(release.assets)
      ) {
        throw new BusinessError(BusinessErrorCode.Validation, 'A stable published release is required');
      }

      const releaseAssets: unknown[] = release.assets;
      const assets = releaseAssets.map(packageObject)
        .filter((asset) => asset.name === 'addon.runtime.gz' && asset.state === 'uploaded');
      const asset = assets[0];

      if (
        assets.length !== 1
        || !asset
        || !Number.isSafeInteger(asset.id)
        || Number(asset.id) < 1
        || !Number.isSafeInteger(asset.size)
        || Number(asset.size) < 1
        || Number(asset.size) > maximumAddonArchiveBytes
        || asset.digest !== undefined
        && asset.digest !== null
          && (typeof asset.digest !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(asset.digest))
      ) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Exactly one bounded addon.runtime.gz asset is required');
      }

      const commit = await this.json(api + '/commits/' + encodeURIComponent(tag), signal, token);

      if (typeof commit.sha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit.sha)) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid release commit');
      }

      const archive = path.join(directory, 'archive.gz');
      const checksum = await this.download(api + '/releases/assets/' + String(asset.id), archive,
        Number(asset.size), signal, token);

      if (typeof asset.digest === 'string' && asset.digest !== 'sha256:' + checksum) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Release checksum mismatch');
      }

      const packageDirectory = path.join(directory, 'package');

      await extractAddonArchive(archive, packageDirectory);
      const manifestPath = path.join(packageDirectory, 'addon.runtime.json');

      if ((await stat(manifestPath)).size > 1024 ** 2) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Runtime manifest exceeds its metadata limit');
      }

      const metadata = packageObject(JSON.parse(await readFile(manifestPath, 'utf8')));

      if (!supportsCmsVersion(metadata.cmsVersion, this.cmsVersion)) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Incompatible or missing CMS version requirement');
      }

      const manifest = await this.packages.validatePackage(packageDirectory, allowUpdate);

      if (manifest.cmsVersion !== metadata.cmsVersion || !supportsCmsVersion(manifest.cmsVersion, this.cmsVersion)) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Incompatible or missing CMS version requirement');
      }

      const contentId = randomUUID();

      this.staged = { contentId, directory, packageDirectory };

      return {
        contentId,
        repositoryUrl: canonical,
        releaseTag: tag,
        sourceCommit: commit.sha,
        artifactChecksum: checksum,
        runtimeDigest: createHash('sha256').update(await readFile(path.join(packageDirectory,
          'addon.runtime.json'))).digest('hex'),
        addonKey: manifest.definition.addonKey,
        implementationVersion: manifest.definition.implementationVersion,
        cmsVersion: this.cmsVersion,
      };
    } catch (error) {
      this.staged = null;
      const failures: unknown[] = [error];

      try {
        if (directory) {
          this.pendingCleanup = directory;
          await this.remove(directory);
          this.pendingCleanup = null;
        }
      } catch (cleanup) {
        failures.push(cleanup);
      } finally {
        this.busy = false;
      }

      if (failures.length > 1) {
        throw new AggregateError(failures, 'Package preparation and staging cleanup failed');
      }
      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Unable to prepare the repository package');
    }
  }

  async install(contentId: string): Promise<void> {
    if (this.staged?.contentId !== contentId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Prepared package not found');
    }
    await this.packages.install(this.staged.packageDirectory);
  }

  private async remove(directory: string): Promise<void> {
    if (path.dirname(directory) !== this.root) {
      throw new Error('Package staging must remain inside its private root');
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 });
  }

  async discard(contentId: string): Promise<void> {
    if (this.staged?.contentId !== contentId) {
      return;
    }

    const staged = this.staged;

    this.staged = null;
    this.pendingCleanup = staged.directory;

    try {
      await this.remove(staged.directory);
      this.pendingCleanup = null;
    } finally {
      this.busy = false;
    }
  }
}
