import { mediaReferenceOrigins } from '../../../domain/media/media-reference-rewrite.policy.js';
import {
  type IActivePublication, PublicationRelease, ReleaseState,
} from '../../../domain/publication/publication-release.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  IPublishMediaAddressRelease,
} from '../../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type {
  IMediaAddressReleaseBuild,
} from '../../../ports/outbound/publication/media-address-release-build.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { IRequestDocumentCachePort } from '../../../ports/outbound/publication/request-document-cache.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class PublishMediaAddressReleaseUseCase implements IPublishMediaAddressRelease {
  constructor(private readonly access: IPublicationAccessPort, private readonly sites: IGetSite,
    private readonly activation: IReleaseActivationPort,
    private readonly store: IPublicationStorePort, private readonly build: IMediaAddressReleaseBuild,
    private readonly values: IPublicationValuesPort, private readonly hooks: IHookChangesPort,
    private readonly cache: Pick<IRequestDocumentCachePort, 'purge'>) {}

  async execute(input: Parameters<IPublishMediaAddressRelease['execute']>[0]): Promise<IActivePublication | null> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const site = await this.sites.execute({ siteId: input.siteId });

    requireCondition(site?.siteId === input.siteId, 'Missing or foreign media-address site');
    const active = await this.activation.getActive(input.siteId);

    if (!active || (!input.paths.length && input.favicon === undefined)) {
      return null;
    }

    const previous = await this.store.read(input.siteId, active.releaseId);

    requireCondition(active.siteId === input.siteId && previous?.siteId === input.siteId
      && previous.releaseId === active.releaseId && previous.state === ReleaseState.Ready
      && site?.siteId === input.siteId, 'Missing or foreign media-address release source');
    const releaseId = this.values.nextReleaseId();
    const createdAt = this.values.now();
    const built = await this.build.build({
      siteId: input.siteId,
      releaseId,
      previous: previous!,
      paths: input.paths,
      ...(input.favicon === undefined ? {} : { favicon: input.favicon }),
      origins: mediaReferenceOrigins(site!.toState()),
    });

    if (!built.changed) {
      this.cache.purge(input.siteId);

      return active;
    }

    const release = new PublicationRelease({
      siteId: input.siteId,
      releaseId,
      state: ReleaseState.Staged,
      ...(previous!.siteKey === undefined ? {} : { siteKey: previous!.siteKey }),
      manifest: null,
      failure: null,
      createdAt,
      completedAt: null,
    });

    release.complete(built.manifest, this.values.now());
    await this.store.stage(release.toState(), built.artifacts);

    try {
      const result = await this.activation.activate({
        siteId: input.siteId,
        releaseId,
        hookChange: await prepareCoreHook(this.hooks, input.siteId, 'publication:' + input.siteId,
          'cms.release.activate.check', { releaseId, reason: 'MediaAddressUpdate' }, 'cms.release.activated',
          input.actorId),
        expectedActiveReleaseId: active.releaseId,
        activatedAt: this.values.now(),
      });

      requireCondition(result.siteId === input.siteId && result.releaseId === releaseId, 'Foreign activation result');

      this.cache.purge(input.siteId);

      return result;
    } catch (error) {
      const receipt = await this.activation.findActivation(input.siteId, releaseId);

      if (receipt) {
        requireCondition(receipt.siteId === input.siteId && receipt.releaseId === releaseId,
          'Foreign activation receipt');

        this.cache.purge(input.siteId);

        return receipt;
      }
      throw error;
    }
  }
}

