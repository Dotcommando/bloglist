import { PublicationRelease, ReleaseState } from '../../../domain/publication/publication-release.js';
import { PublicationConsistencyError } from '../../../domain/publication/published-document.js';
import { type PublishedResolution, PublishedResolutionKind } from '../../../domain/publication/published-resolution.js';
import { PublishedRouteKind } from '../../../domain/publication/published-route.js';
import { requireUrlPath } from '../../../domain/routing/url-path.policy.js';
import { requireCondition, requireText } from '../../../domain/shared/validation.js';
import type {
  IResolvePublishedPath,
  IResolvePublishedPathInput,
} from '../../../ports/inbound/publication/resolve-published-path.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';

export class ResolvePublishedPathUseCase implements IResolvePublishedPath {
  constructor(private readonly activation: IReleaseActivationPort, private readonly store: IPublicationStorePort) {}

  async execute(input: IResolvePublishedPathInput): Promise<PublishedResolution> {
    requireText(input.siteId, 'siteId');
    requireUrlPath(input.path);

    try {
      return await this.resolve(input);
    } catch (cause) {
      throw new PublicationConsistencyError('Active publication data is unavailable or inconsistent', { cause });
    }
  }

  private async resolve(input: IResolvePublishedPathInput): Promise<PublishedResolution> {
    const active = await this.activation.getActive(input.siteId);

    if (!active) {
      return { kind: PublishedResolutionKind.NotFound };
    }
    requireCondition(active.siteId === input.siteId, 'Foreign active publication');
    const state = await this.store.read(input.siteId, active.releaseId, true);

    requireCondition(state !== null && state.siteId === input.siteId && state.releaseId === active.releaseId
      && state.state === ReleaseState.Ready, 'Active release is missing or inconsistent');

    if (!state) {
      throw new Error('Missing active release');
    }

    const release = new PublicationRelease(state).toState();
    const route = release.manifest!.routes.find((route) => route.path === input.path);

    if (!route) {
      return { kind: PublishedResolutionKind.NotFound };
    }
    if (route.kind === PublishedRouteKind.Static) {
      return {
        kind: PublishedResolutionKind.StoredDocument,
        releaseId: active.releaseId,
        documentPath: route.documentPath,
        ...(route.markdownPath === undefined ? {} : { markdownPath: route.markdownPath }),
        ...(route.robotsIndex === undefined ? {} : { robotsIndex: route.robotsIndex }),
      };
    }
    if (route.kind === PublishedRouteKind.Request) {
      requireCondition(release.manifest!.artifacts.some((artifact) => artifact.path === `plans/${route.renderPlanId}.json`
        && !artifact.public), 'Missing private Request plan');

      return {
        kind: PublishedResolutionKind.RequestPlan,
        releaseId: active.releaseId,
        renderPlanId: route.renderPlanId,
        ...(route.robotsIndex === undefined ? {} : { robotsIndex: route.robotsIndex }),
      };
    }
    if (route.targetPath !== undefined) {
      return {
        kind: PublishedResolutionKind.Redirect,
        releaseId: active.releaseId,
        targetPath: route.targetPath,
        status: route.status,
      };
    }

    let targetId = route.targetUrlId;
    const visited = new Set([route.urlId]);

    while (true) {
      requireCondition(!visited.has(targetId), 'Corrupt redirect cycle');
      visited.add(targetId);
      const target = release.manifest!.routes.find((route) => route.urlId === targetId);

      requireCondition(target !== undefined, 'Missing redirect target');

      if (!target) {
        throw new Error('Missing redirect target');
      }
      if (target.kind !== PublishedRouteKind.Redirect) {
        return {
          kind: PublishedResolutionKind.Redirect,
          releaseId: active.releaseId,
          targetPath: target.path,
          status: route.status,
        };
      }
      targetId = target.targetUrlId;
    }
  }
}
