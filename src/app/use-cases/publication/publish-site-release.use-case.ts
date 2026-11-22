import { HtmlDelivery, LoaderPhase } from '../../../domain/pages/page-rendering.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import {
  type IActivePublication,
  PublicationRelease,
  ReleaseState,
} from '../../../domain/publication/publication-release.js';
import { summarizePublishedPages } from '../../../domain/publication/published-page-summary.js';
import type { IRenderedDocument, IRenderPlan } from '../../../domain/publication/render-plan.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  IPublishSiteRelease,
  IPublishSiteReleaseInput,
} from '../../../ports/inbound/publication/publish-site-release.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IFrontendBuildPort } from '../../../ports/outbound/publication/frontend-build.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';

export class PublishSiteReleaseUseCase implements IPublishSiteRelease {
  constructor(private readonly access: IPublicationAccessPort, private readonly source:
  IPublicationSourcePort, private readonly composition: ITemplateCompositionPort, private readonly runtime:
  IRenderRuntime, private readonly frontend: IFrontendBuildPort, private readonly store:
  IPublicationStorePort, private readonly activation: IReleaseActivationPort, private readonly values:
  IPublicationValuesPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IPublishSiteReleaseInput): Promise<IActivePublication> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const active = await this.activation.getActive(input.siteId);

    requireCondition(!active || active.siteId === input.siteId, 'Foreign active publication');

    if ((active?.releaseId ?? null) !== input.expectedActiveReleaseId) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Active release changed');
    }

    const releaseId = this.values.nextReleaseId();
    const createdAt = this.values.now();
    const snapshot = await this.source.capture(input.siteId);

    requireCondition(snapshot.siteId === input.siteId && snapshot.pages.every((page) => page.siteId === input.siteId)
      && snapshot.urls.every((url) => url.siteId === input.siteId), 'Foreign publication source');
    const release = new PublicationRelease({
      releaseId,
      siteId: input.siteId,
      siteKey: snapshot.siteKey,
      state: ReleaseState.Staged,
      manifest: null,
      failure: null,
      createdAt,
      completedAt: null,
    });
    const documents: IRenderedDocument[] = [];
    const requestPlans: IRenderPlan[] = [];

    for (const page of snapshot.pages) {
      if (!snapshot.urls.some((url) => url.kind === UrlKind.PAGE && url.pageId === page.pageId)) {
        continue;
      }
      requireCondition(page.status === PageStatus.PUBLISHED, 'A release cannot use a draft as published content');

      const plan = await this.composition.prepare(snapshot, page.pageId);
      const document = await this.runtime.render(plan, false, {}, LoaderPhase.Build);

      if (plan.rendering.delivery === HtmlDelivery.Static) {
        documents.push(document);
      } else {
        requestPlans.push({ ...plan, buildValues: document.buildValues ?? {} });
      }
    }
    const built = await this.frontend.build({
      releaseId,
      snapshot,
      documents,
      requestPlans,
      assetBasePath: `/assets/releases/${encodeURIComponent(releaseId)}/`,
    });

    release.complete({
      ...built.manifest,
      publishedPages: summarizePublishedPages(input.siteId, snapshot.pages, snapshot.urls, snapshot.templateValues),
    }, this.values.now());
    await this.store.stage(release.toState(), built.artifacts);

    try {
      const activated = await this.activation.activate({
        siteId: input.siteId,
        releaseId,
        hookChange: await prepareCoreHook(this.hooks, input.siteId, 'publication:' + input.siteId,
          'cms.release.activate.check', { releaseId, reason: 'SitePublication' }, 'cms.release.activated',
          input.actorId),
        expectedActiveReleaseId: input.expectedActiveReleaseId,
        activatedAt: this.values.now(),
      });

      requireCondition(activated.siteId === input.siteId && activated.releaseId === releaseId,
        'Foreign activation result');

      return activated;
    } catch (error) {
      const acknowledged = await this.activation.findActivation(input.siteId, releaseId);

      if (acknowledged) {
        requireCondition(acknowledged.siteId === input.siteId && acknowledged.releaseId === releaseId,
          'Foreign activation receipt');

        return acknowledged;
      }
      throw error;
    }
  }
}
