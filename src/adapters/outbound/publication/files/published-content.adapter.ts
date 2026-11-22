import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { Model } from 'mongoose';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';

import type { IArtifactMetadata } from '../../../../domain/publication/publication-artifact.js';
import {
  type IPublicationReleaseState,
  PublicationRelease,
  ReleaseState,
} from '../../../../domain/publication/publication-release.js';
import type { IPublishedArtifact } from '../../../../domain/publication/published-artifact.js';
import {
  type IStoredRequestPlan,
  PublicationConsistencyError,
} from '../../../../domain/publication/published-document.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { requireAssetPath } from '../../../../domain/shared/validation.js';
import type { IPublicArtifactPort } from '../../../../ports/outbound/publication/public-artifact.port.js';
import type { IPublishedPlanPort } from '../../../../ports/outbound/publication/published-plan.port.js';
import type { ISiteStorageScope } from '../../../../ports/outbound/sites/site-storage.port.js';
import type { IReleaseRecord } from '../../persistence/mongoose/publication/publication.models.js';
import { isSiteFaviconLink } from '../../rendering/html/favicon-head.js';
import { fileStyleHashes } from '../../rendering/html/file-style-hashes.js';
import { checksum } from '../../rendering/vite/artifacts.js';
import { digestFile, fileContent } from '../../storage/files/binary-file.js';
import { ParsedRequestPlanCache } from '../memory/parsed-request-plan-cache.js';
import { decodePlan } from './plan-decoder.js';
import { PublicationDirectoryAdapter } from './publication-directory.adapter.js';

export class FilePublishedContentAdapter implements IPublishedPlanPort, IPublicArtifactPort {
  private readonly directories: PublicationDirectoryAdapter;
  readonly planCache = new ParsedRequestPlanCache();

  constructor(private readonly root: string, private readonly releases: Model<IReleaseRecord>,
    scope: ISiteStorageScope) {
    this.directories = new PublicationDirectoryAdapter(root, scope);
  }

  private async release(siteId: string, releaseId: string): Promise<IPublicationReleaseState | null> {
    const record = await this.releases.findOne({ _id: releaseId, siteId }).lean().exec();

    if (!record) {
      return null;
    }

    let release: IPublicationReleaseState;

    try {
      release = new PublicationRelease({
        releaseId: record._id,
        siteId: record.siteId,
        ...(record.siteKey === undefined ? {} : { siteKey: record.siteKey }),
        state: record.state,
        manifest: record.manifest,
        failure: record.failure,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
      }).toState();
    } catch (cause) {
      throw new PublicationConsistencyError('Invalid stored release metadata', { cause });
    }

    if (release.siteId !== siteId || release.releaseId !== releaseId) {
      throw new PublicationConsistencyError('Foreign release');
    }

    return release.state === ReleaseState.Ready ? release : null;
  }

  private async location(release: IPublicationReleaseState, metadata: IArtifactMetadata): Promise<string> {
    requireAssetPath(metadata.path);
    const root = await realpath(this.root);
    const directory = await realpath(await this.directories.resolve(release));
    const contentRoot = await realpath(path.join(directory, metadata.public ? 'public' : ''));
    const filename = await realpath(path.join(contentRoot, metadata.path));

    if (
      !directory.startsWith(root + path.sep)
      || (contentRoot !== directory
      && !contentRoot.startsWith(directory + path.sep))
      || !filename.startsWith(contentRoot + path.sep)
    ) {
      throw new PublicationConsistencyError('Publication file escapes its release');
    }
    if ((await stat(filename)).size !== metadata.byteSize) {
      throw new PublicationConsistencyError('Corrupt publication artifact size');
    }

    return filename;
  }

  private async bytes(release: IPublicationReleaseState, metadata: IArtifactMetadata): Promise<Uint8Array> {
    const bytes = await readFile(await this.location(release, metadata));

    if (bytes.byteLength !== metadata.byteSize || checksum(bytes) !== metadata.checksum) {
      throw new PublicationConsistencyError('Corrupt publication artifact');
    }

    return bytes;
  }

  purgePlans(): void {
    this.planCache.purge();
  }

  onModuleDestroy(): void {
    this.planCache.onModuleDestroy();
  }

  async readPlan(siteId: string, releaseId: string, planId: string): Promise<IStoredRequestPlan | null> {
    requireAssetPath(`plans/${planId}.json`);

    return this.planCache.resolve(siteId, releaseId, planId, () => this.readVerifiedPlan(siteId, releaseId, planId));
  }

  private async readVerifiedPlan(siteId: string, releaseId: string,
    planId: string): Promise<IStoredRequestPlan | null> {
    requireAssetPath(`plans/${planId}.json`);
    const release = await this.release(siteId, releaseId);
    const route = release?.manifest?.routes.find((route) =>
      route.kind === PublishedRouteKind.Request && route.renderPlanId === planId);

    if (!release || route?.kind !== PublishedRouteKind.Request) {
      return null;
    }

    const metadata = release.manifest!.artifacts.find((artifact) => artifact.path === `plans/${planId}.json` && !artifact.public);

    if (!metadata) {
      throw new PublicationConsistencyError('Private plan metadata is missing');
    }

    try {
      const data = decodePlan(JSON.parse(new TextDecoder().decode(await this.bytes(release, metadata))));

      if (data.plan.planId !== planId || data.plan.pageId !== route.pageId || data.plan.siteId !== siteId) {
        throw new PublicationConsistencyError('Private plan identity mismatch');
      }
      if (!isDeepStrictEqual(data.plan.page.rendering, data.plan.rendering)) {
        throw new PublicationConsistencyError('Stored page rendering differs from its plan');
      }
      this.validateAssets(data.assets.head + data.assets.body, release);

      const stored = { siteId, releaseId, ...data };
      const contentFingerprint = createHash('sha256').update(JSON.stringify(stored)).digest('hex');

      return { ...stored, contentFingerprint };
    } catch (cause) {
      throw new PublicationConsistencyError('Invalid stored Request plan', { cause });
    }
  }

  private validateAssets(html: string, release: IPublicationReleaseState): void {
    const visit = (node: DefaultTreeAdapterMap['node']): void => {
      if ('tagName' in node && ['link', 'script'].includes(node.tagName) && !isSiteFaviconLink(node)) {
        const attributeName = node.tagName === 'link' ? 'href' : 'src';
        const reference = node.attrs.find((attribute) => attribute.name === attributeName)?.value;

        if (reference) {
          const qualified = `/assets/releases/${encodeURIComponent(release.releaseId)}/`;
          const assetPath = reference.startsWith(qualified) ? `assets/${reference.slice(qualified.length)}`
            : reference.startsWith('/assets/') && !reference.startsWith('/assets/releases/')
              ? reference.slice(1) : null;

          if (!assetPath || !release.manifest?.artifacts.some((entry) => entry.public && entry.path === assetPath)) {
            throw new PublicationConsistencyError('Prebuilt asset is outside the selected release');
          }
        }
      }
      if ('childNodes' in node) {
        node.childNodes.forEach(visit);
      }
    };

    visit(parseFragment(html));
  }

  async readPublicArtifact(siteId: string, releaseId: string, artifactPath: string, metadataOnly = false):
  Promise<IPublishedArtifact | null> {
    requireAssetPath(artifactPath);
    const release = await this.release(siteId, releaseId);

    if (!release) {
      return null;
    }

    const metadata = release.manifest!.artifacts.find((entry) => entry.path === artifactPath && entry.public);

    if (!metadata) {
      return null;
    }

    try {
      const filename = await this.location(release, metadata);
      const content = fileContent(filename, metadata.byteSize, metadata.mimeType);

      if (!metadataOnly) {
        const verified = await digestFile(filename);

        if (verified.byteSize !== metadata.byteSize || verified.checksum !== metadata.checksum) {
          throw new PublicationConsistencyError('Corrupt publication artifact');
        }
      }

      return {
        siteId,
        releaseId,
        metadata,
        content: metadataOnly ? {
          byteSize: metadata.byteSize,
          mimeType: metadata.mimeType,
          bytes: {
            [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
              throw new PublicationConsistencyError('Metadata lookup does not provide content');
            },
          },
        } : content,
        inlineStyleHashes: !metadataOnly && metadata.mimeType === 'text/html' ? await fileStyleHashes(content) : [],
      };
    } catch (cause) {
      throw new PublicationConsistencyError('Invalid stored public artifact', { cause });
    }
  }
}
