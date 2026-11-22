import { HtmlDelivery, LoaderPhase } from '../../../domain/pages/page-rendering.js';
import { PublicationRelease, ReleaseState } from '../../../domain/publication/publication-release.js';
import { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import { ElementUsageKind } from '../../../domain/rendering/rendering-element.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IRepublishSnippetPages } from '../../../ports/inbound/publication/republish-snippet-pages.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageReleaseBuildPort } from '../../../ports/outbound/publication/page-release-build.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import type { IElementUsages } from '../../../ports/outbound/rendering/element-sources.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';

export class RepublishSnippetPagesUseCase implements IRepublishSnippetPages {
  constructor(private readonly usages: IElementUsages, private readonly source: IPublicationSourcePort,
    private readonly composition: ITemplateCompositionPort, private readonly runtime: IRenderRuntime,
    private readonly frontend: IPageReleaseBuildPort, private readonly store: IPublicationStorePort,
    private readonly activation: IReleaseActivationPort, private readonly values: IPublicationValuesPort,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: Parameters<IRepublishSnippetPages['execute']>[0]): Promise<void> {
    const active = await this.activation.getActive(input.siteId);

    if (!active) {
      return;
    }

    const original = await this.store.read(input.siteId, active.releaseId);

    if (original?.siteId !== input.siteId || original.state !== ReleaseState.Ready || !original.manifest) {
      throw new Error('Missing active release for Snippet republication');
    }

    let previous = original;
    const retainedPages = original.manifest.publishedPages ?? [];
    const usages = await this.usages.find({ ...input, kind: TemplateSourceKind.Snippet });
    const pageIds = [...new Set(usages.filter((usage) => usage.kind === ElementUsageKind.Page
      && previous!.manifest!.routes.some((route) => 'pageId' in route && route.pageId === usage.id))
      .map((usage) => usage.id))];

    if (!pageIds.length) {
      return;
    }

    const captured = await this.source.capture(input.siteId);

    requireCondition(captured.siteId === input.siteId && captured.pages.every((page) => page.siteId === input.siteId),
      'Foreign Snippet publication source');
    const publishedPages = retainedPages.map((page) => ({
      ...page,
      tv: captured.templateValues?.[page.pageId] ?? page.tv ?? {},
      tvValues: captured.pages.find((candidate) => candidate.pageId === page.pageId)?.tvValues ?? page.tvValues ?? {},
    }));
    const snapshot = { ...captured, publishedPages };

    for (const pageId of pageIds) {
      requireCondition(snapshot.pages.some((page) => page.pageId === pageId), 'Missing published Snippet dependency');
      const plan = await this.composition.prepare(snapshot, pageId);
      const document = await this.runtime.render(plan, false, {}, LoaderPhase.Build);
      const releaseId = this.values.nextReleaseId();
      const built = await this.frontend.buildPage({
        releaseId,
        pageId,
        previous,
        assetBasePath: '/assets/releases/' + encodeURIComponent(releaseId) + '/',
        snapshot,
        documents: plan.rendering.delivery === HtmlDelivery.Static ? [document] : [],
        requestPlans: plan.rendering.delivery === HtmlDelivery.Request
          ? [{ ...plan, buildValues: document.buildValues ?? {} }] : [],
      });
      const release = new PublicationRelease({
        releaseId,
        siteId: input.siteId,
        siteKey: snapshot.siteKey,
        state: ReleaseState.Staged,
        manifest: null,
        failure: null,
        createdAt: this.values.now(),
        completedAt: null,
      });

      release.complete({ ...built.manifest, publishedPages }, this.values.now());
      await this.store.stage(release.toState(), built.artifacts);
      previous = release.toState();
    }

    try {
      await this.activation.activate({
        siteId: input.siteId,
        releaseId: previous.releaseId,
        expectedActiveReleaseId: active.releaseId,
        activatedAt: this.values.now(),
        hookChange: await prepareCoreHook(this.hooks, input.siteId, 'publication:' + input.siteId,
          'cms.release.activate.check', { releaseId: previous.releaseId, reason: 'SnippetUpdate' },
          'cms.release.activated', 'system'),
      });
    } catch (error) {
      if (!await this.activation.findActivation(input.siteId, previous.releaseId)) {
        throw error;
      }
    }
  }
}
