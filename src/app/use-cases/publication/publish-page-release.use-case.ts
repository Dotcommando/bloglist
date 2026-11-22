import { HtmlDelivery, LoaderPhase } from '../../../domain/pages/page-rendering.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { PublicationRelease, ReleaseState } from '../../../domain/publication/publication-release.js';
import { summarizePublishedPages, validatePublishedPages } from '../../../domain/publication/published-page-summary.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IPublishPage } from '../../../ports/inbound/pages/publish-page.port.js';
import type {
  IPublishPageRelease, IPublishPageReleaseInput, IPublishPageReleaseResult,
} from '../../../ports/inbound/publication/publish-page-release.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageReleaseBuildPort } from '../../../ports/outbound/publication/page-release-build.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import type {
  ITemplateVariablePublication,
} from '../../../ports/outbound/template-variables/template-variables.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';

export class PublishPageReleaseUseCase implements IPublishPageRelease {
  constructor(private readonly access: IPublicationAccessPort, private readonly publish: IPublishPage,
    private readonly source: IPublicationSourcePort,
    private readonly composition: ITemplateCompositionPort, private readonly runtime: IRenderRuntime,
    private readonly frontend: IPageReleaseBuildPort, private readonly store: IPublicationStorePort,
    private readonly activation: IReleaseActivationPort, private readonly values: IPublicationValuesPort,
    private readonly hooks: IHookChangesPort,
    private readonly variables: Pick<ITemplateVariablePublication, 'prepare'>) {}

  async execute(input: IPublishPageReleaseInput): Promise<IPublishPageReleaseResult> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const active = await this.activation.getActive(input.siteId);
    const previous = active ? await this.store.read(input.siteId, active.releaseId) : null;
    const createdAt = this.values.now();

    requireCondition(!active || active.siteId === input.siteId && previous?.siteId === input.siteId
      && previous.releaseId === active.releaseId && previous.state === ReleaseState.Ready,
    'Missing or foreign active release');
    validatePublishedPages(input.siteId, previous?.manifest?.publishedPages ?? []);
    const page = await this.publish.execute({ siteId: input.siteId, pageId: input.pageId });

    requireCondition(page.siteId === input.siteId && page.pageId === input.pageId
      && page.status === PageStatus.PUBLISHED, 'Missing or foreign published page');
    const captured = await this.source.capture(input.siteId);

    requireCondition(captured.siteId === input.siteId && captured.pages.every((page) => page.siteId === input.siteId)
      && captured.urls.every((url) => url.siteId === input.siteId),
    'Foreign publication source');
    const urls = captured.urls.filter((url) => {
      const visited = new Set<string>();
      let current = url;

      while (current.kind === UrlKind.REDIRECT && current.redirectTargetUrlId) {
        requireCondition(!visited.has(current.urlId), 'Redirect cycle');
        visited.add(current.urlId);
        const target = captured.urls.find((candidate) => candidate.urlId === current.redirectTargetUrlId);

        if (!target) {
          return false;
        }
        current = target;
      }

      return current.pageId === input.pageId;
    });

    requireCondition(urls.some((url) => url.kind === UrlKind.PAGE && url.pageId === input.pageId),
      'Page needs a public URL before publication');
    const publishedPages = [
      ...await Promise.all((previous?.manifest?.publishedPages ?? [])
        .filter((summary) => summary.pageId !== input.pageId)
        .map(async (summary) => ({
          ...summary,
          tv: summary.tv ?? await this.variables.prepare(input.siteId, summary.tvValues ?? {}),
          pageNumber: summary.pageNumber
          ?? captured.pages.find((page) => page.pageId === summary.pageId)?.pageNumber ?? null,
        }))),
      ...summarizePublishedPages(input.siteId, [page.toState()], urls, captured.templateValues),
    ];
    const snapshot = { ...captured, pages: [page.toState()], urls, publishedPages };
    const plan = await this.composition.prepare(snapshot, input.pageId);
    const document = await this.runtime.render(plan, false, {}, LoaderPhase.Build);
    const releaseId = this.values.nextReleaseId();
    const built = await this.frontend.buildPage({
      releaseId,
      pageId: input.pageId,
      previous,
      assetBasePath: `/assets/releases/${encodeURIComponent(releaseId)}/`,
      snapshot,
      documents: plan.rendering.delivery === HtmlDelivery.Static ? [document] : [],
      requestPlans: plan.rendering.delivery === HtmlDelivery.Request
        ? [{ ...plan, buildValues: document.buildValues ?? {} }] : [],
    });
    const release = new PublicationRelease({
      releaseId,
      siteId: input.siteId,
      siteKey: captured.siteKey,
      state: ReleaseState.Staged,
      manifest: null,
      failure: null,
      createdAt,
      completedAt: null,
    });

    release.complete({ ...built.manifest, publishedPages }, this.values.now());
    await this.store.stage(release.toState(), built.artifacts);

    try {
      const publication = await this.activation.activate({
        siteId: input.siteId,
        releaseId,
        hookChange: await prepareCoreHook(this.hooks, input.siteId, 'publication:' + input.siteId,
          'cms.release.activate.check', { releaseId, reason: 'PagePublication' }, 'cms.release.activated',
          input.actorId),
        expectedActiveReleaseId: active?.releaseId ?? null,
        activatedAt: this.values.now(),
      });

      requireCondition(publication.siteId === input.siteId && publication.releaseId === releaseId,
        'Foreign activation result');

      return { page, publication };
    } catch (error) {
      const acknowledged = await this.activation.findActivation(input.siteId, releaseId);

      if (acknowledged) {
        requireCondition(acknowledged.siteId === input.siteId && acknowledged.releaseId === releaseId,
          'Foreign activation acknowledgement');

        return { page, publication: acknowledged };
      }
      throw error;
    }
  }
}
