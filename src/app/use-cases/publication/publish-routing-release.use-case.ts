import {
  type IActivePublication, PublicationRelease, ReleaseState,
} from '../../../domain/publication/publication-release.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IPublishRoutingRelease } from '../../../ports/inbound/publication/publish-routing-release.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { IRoutingReleaseBuildPort } from '../../../ports/outbound/publication/routing-release-build.port.js';
import type { IRoutingSourcePort } from '../../../ports/outbound/routing/routing-source.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class PublishRoutingReleaseUseCase implements IPublishRoutingRelease {
  constructor(private readonly access: IPublicationAccessPort, private readonly sites: IGetSite,
    private readonly routing: IRoutingSourcePort, private readonly activation: IReleaseActivationPort,
    private readonly store: IPublicationStorePort, private readonly build: IRoutingReleaseBuildPort,
    private readonly values: IPublicationValuesPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: { siteId: string; actorId: string }): Promise<IActivePublication | null> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const site = await this.sites.execute({ siteId: input.siteId });

    requireCondition(site?.siteId === input.siteId, 'Missing or foreign routing site');
    const active = await this.activation.getActive(input.siteId);

    if (!active) {
      return null;
    }

    const previous = await this.store.read(input.siteId, active.releaseId);

    requireCondition(active.siteId === input.siteId && previous?.siteId === input.siteId
      && previous.releaseId === active.releaseId && previous.state === ReleaseState.Ready
      && site?.siteId === input.siteId, 'Missing or foreign routing release source');
    const releaseId = this.values.nextReleaseId();
    const createdAt = this.values.now();
    const built = await this.build.build({
      siteId: input.siteId,
      releaseId,
      previous: previous!,
      urls: await this.routing.readUrls(input.siteId),
      publicOrigin: servingSiteOrigin(site!.toState().addresses),
    });
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
          'cms.release.activate.check', { releaseId, reason: 'RoutingApplication' }, 'cms.release.activated',
          input.actorId),
        expectedActiveReleaseId: active.releaseId,
        activatedAt: this.values.now(),
      });

      requireCondition(result.siteId === input.siteId && result.releaseId === releaseId, 'Foreign activation result');

      return result;
    } catch (error) {
      const receipt = await this.activation.findActivation(input.siteId, releaseId);

      if (receipt) {
        requireCondition(receipt.siteId === input.siteId && receipt.releaseId === releaseId,
          'Foreign activation receipt');

        return receipt;
      }
      throw error;
    }
  }
}

import { servingSiteOrigin } from '../../../domain/sites/site-addresses.js';
