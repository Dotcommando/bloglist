import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import type { Model } from 'mongoose';

import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import {
  type IPublicationReleaseState,
  PublicationRelease,
  ReleaseState,
} from '../../../../domain/publication/publication-release.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import { requireAssetPath, requireCondition } from '../../../../domain/shared/validation.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../../../ports/outbound/publication/publication-store.port.js';
import type { ISiteStorageScope } from '../../../../ports/outbound/sites/site-storage.port.js';
import type { IReleaseRecord } from '../../persistence/mongoose/publication/publication.models.js';
import { artifact } from '../../rendering/vite/artifacts.js';
import { digestFile, fileContent, writeFileContent } from '../../storage/files/binary-file.js';
import { PublicationDirectoryAdapter } from './publication-directory.adapter.js';

export class FilePublicationStoreAdapter implements IPublicationStorePort, IPublicationArtifactSourcePort {
  private readonly directories: PublicationDirectoryAdapter;
  private readonly pendingReads = new Map<string, Promise<IPublicationReleaseState | null>>();

  constructor(private readonly root: string, private readonly releases: Model<IReleaseRecord>,
    scope: ISiteStorageScope) {
    this.directories = new PublicationDirectoryAdapter(root, scope);
  }

  async readArtifacts(siteId: string, releaseId: string, paths?: readonly string[]):
  Promise<readonly IPublicationArtifact[]> {
    for (const selected of paths ?? []) {
      requireAssetPath(selected);
    }
    const release = await this.read(siteId, releaseId, paths !== undefined);

    requireCondition(release?.siteId === siteId && release.releaseId === releaseId
      && release.state === ReleaseState.Ready && release.manifest !== null, 'Missing or foreign release');

    if (!release?.manifest) {
      throw new Error('Missing release');
    }

    const root = await realpath(this.root);
    const directory = await realpath(await this.directories.resolve(release));

    requireCondition(directory.startsWith(root + path.sep), 'Release escapes configured root');
    const output: IPublicationArtifact[] = [];
    const selected = release.manifest.artifacts.filter((item) => paths === undefined || paths.includes(item.path));

    for (const metadata of selected) {
      requireAssetPath(metadata.path);
      const contentRoot = await realpath(path.join(directory, metadata.public ? 'public' : ''));
      const filename = await realpath(path.join(contentRoot, metadata.path));

      requireCondition((contentRoot === directory || contentRoot.startsWith(directory + path.sep))
        && filename.startsWith(contentRoot + path.sep), 'Artifact escapes its content root');
      const verified = await digestFile(filename);

      requireCondition(verified.byteSize === metadata.byteSize && verified.checksum === metadata.checksum,
        'Corrupt reusable artifact');
      output.push({ ...metadata, content: fileContent(filename, metadata.byteSize, metadata.mimeType) });
    }

    return output;
  }

  private async write(directory: string, relative: string, content: IBinaryContent,
    expectedChecksum: string): Promise<void> {
    requireAssetPath(relative);
    const filename = path.join(directory, relative);

    await mkdir(path.dirname(filename), { recursive: true });
    const canonical = await realpath(path.dirname(filename));
    const base = await realpath(directory);

    requireCondition(canonical === base || canonical.startsWith(`${base}${path.sep}`), 'Artifact escapes release');
    const written = await writeFileContent(filename, content, content.byteSize);

    requireCondition(written.checksum === expectedChecksum, 'Artifact checksum mismatch');
  }

  async stage(state: IPublicationReleaseState, artifacts: readonly IPublicationArtifact[]): Promise<void> {
    const release = new PublicationRelease(state).toState();

    await this.directories.withWrite(release, (final) => this.stageReady(release, artifacts, final));
  }

  private async stageReady(release: IPublicationReleaseState, artifacts: readonly IPublicationArtifact[],
    final: string): Promise<void> {
    requireCondition(release.state === ReleaseState.Ready && release.manifest !== null,
      'Only complete releases can be staged');
    const metadata = artifacts.map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
      ({ path, mimeType, byteSize, checksum, public: publicFile }));

    requireCondition(isDeepStrictEqual(metadata, release.manifest!.artifacts), 'Manifest/artifact metadata mismatch');

    await mkdir(path.dirname(final), { recursive: true });
    const canonicalRoot = await realpath(this.root);
    const parent = await realpath(path.dirname(final));

    requireCondition(parent.startsWith(`${canonicalRoot}${path.sep}`), 'Release escapes configured artifact root');
    const staging = path.join(parent, `.staging-${randomUUID()}`);

    await mkdir(staging);

    try {
      await mkdir(path.join(staging, 'public'));

      for (const file of artifacts) {
        requireCondition(file.path !== 'manifest.json', 'Manifest path is reserved');
        await this.write(staging, (file.public ? 'public/' : '') + file.path, file.content, file.checksum);
      }
      const manifest = artifact('manifest.json', 'application/json', JSON.stringify(release.manifest), false);

      await this.write(staging, manifest.path, manifest.content, manifest.checksum);
      await this.moveComplete(staging, final);
      const { releaseId, ...fields } = release;

      await this.releases.insertOne({ _id: releaseId, ...fields });
    } finally {
      await rm(staging, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 });
    }
  }

  private async moveComplete(staging: string, final: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(staging, final);

        return;
      } catch (error) {
        if (
          attempt >= 4
          || !(error instanceof Error && 'code' in error
          && ['EPERM', 'EBUSY'].includes(String(error.code)))
        ) {
          throw error;
        }
        await setTimeout(25 * 2 ** attempt);
      }
    }
  }

  async read(siteId: string, releaseId: string, metadataOnly = false): Promise<IPublicationReleaseState | null> {
    const key = JSON.stringify([siteId, releaseId, metadataOnly]);
    let pending = this.pendingReads.get(key);

    if (!pending) {
      pending = this.readVerified(siteId, releaseId, metadataOnly).finally(() => {
        if (this.pendingReads.get(key) === pending) {
          this.pendingReads.delete(key);
        }
      });

      if (this.pendingReads.size < 128) {
        this.pendingReads.set(key, pending);
      }
    }

    const release = await pending;

    return release === null ? null : structuredClone(release);
  }

  private async readVerified(siteId: string, releaseId: string,
    metadataOnly: boolean): Promise<IPublicationReleaseState | null> {
    const record = await this.releases.findOne({ _id: releaseId, siteId }).lean().exec();

    if (!record) {
      return null;
    }

    const { _id, ...fields } = record;
    const release = new PublicationRelease({ ...fields, releaseId: _id }).toState();

    requireCondition(release.siteId === siteId && release.releaseId === releaseId, 'Foreign release metadata');

    if (release.state !== ReleaseState.Ready) {
      return release;
    }

    const directory = await realpath(await this.directories.resolve(release));
    const canonicalRoot = await realpath(this.root);

    requireCondition(directory.startsWith(`${canonicalRoot}${path.sep}`), 'Release escapes configured root');
    const manifest: unknown = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));

    requireCondition(isDeepStrictEqual(manifest, release.manifest), 'Release manifest mismatch');

    if (metadataOnly) {
      return release;
    }

    for (const artifact of release.manifest!.artifacts) {
      const filename = await realpath(path.join(directory, artifact.public ? 'public' : '', artifact.path));

      requireCondition(filename.startsWith(`${directory}${path.sep}`), 'Artifact escapes immutable release');
      const verified = await digestFile(filename);

      requireCondition(verified.byteSize === artifact.byteSize && verified.checksum === artifact.checksum,
        'Corrupt release artifact');
    }

    return release;
  }
}
