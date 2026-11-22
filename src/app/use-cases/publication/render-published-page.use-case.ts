import { RenderStage } from '../../../domain/diagnostics/page-resolution.js';
import { HtmlDelivery, type ITemplateObject } from '../../../domain/pages/page-rendering.js';
import {
  DocumentRepresentation,
  type IPublishedDocument,
  PublicationConsistencyError,
  PublishedDataUnavailableError,
} from '../../../domain/publication/published-document.js';
import { RequestCacheStatus } from '../../../domain/publication/published-document.js';
import { parseRequestCachePolicy } from '../../../domain/publication/request-cache.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import type {
  IRenderPublishedPage,
  IRenderPublishedPageInput,
} from '../../../ports/inbound/publication/render-published-page.port.js';
import type { IRenderObservationPort } from '../../../ports/outbound/diagnostics/render-observation.port.js';
import type { IDocumentOutputPort } from '../../../ports/outbound/publication/document-output.port.js';
import type { IMarkdownConversionPort } from '../../../ports/outbound/publication/markdown-conversion.port.js';
import type { IPublishedPlanPort } from '../../../ports/outbound/publication/published-plan.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';
import type { IRequestDocumentCachePort } from '../../../ports/outbound/publication/request-document-cache.port.js';
import type { IRequestDocumentRefreshPort } from '../../../ports/outbound/publication/request-document-refresh.port.js';
import { PublishedDocumentRenderingService } from '../../services/publication/published-document-rendering.service.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';
import { canonical } from '../../services/publication/render-data.service.js';
import type {
  IRequestCacheRefresh, RequestDocumentCacheService,
} from '../../services/publication/request-document-cache.service.js';

export class RenderPublishedPageUseCase implements IRenderPublishedPage {
  private readonly documents: PublishedDocumentRenderingService;

  constructor(private readonly plans: IPublishedPlanPort, runtime: IRenderRuntime,
    private readonly output: IDocumentOutputPort, private readonly activation: IReleaseActivationPort,
    markdown: IMarkdownConversionPort, private readonly observation?: IRenderObservationPort,
    private readonly cache?: RequestDocumentCacheService, private readonly cacheStore?: IRequestDocumentCachePort,
    private readonly refresh?: IRequestDocumentRefreshPort) {
    this.documents = new PublishedDocumentRenderingService(runtime, output, markdown, observation);
  }

  private step<T>(stage: RenderStage, operation: () => Promise<T>): Promise<T> {
    return this.observation?.measure(stage, operation) ?? operation();
  }

  private sync<T>(stage: RenderStage, operation: () => T): T {
    return this.observation ? this.observation.sync(stage, operation) : operation();
  }

  async execute(input: IRenderPublishedPageInput): Promise<IPublishedDocument> {
    for (const [key, value] of Object.entries({
      siteId: input.siteId,
      releaseId: input.releaseId,
      planId: input.renderPlanId,
    })) {
      requireText(value, key);
    }
    await this.step(RenderStage.Activation, async () => {
      const receipt = await this.activation.findActivation(input.siteId, input.releaseId);

      if (!receipt) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Published release not found');
      }
      if (receipt.siteId !== input.siteId || receipt.releaseId !== input.releaseId) {
        throw new PublicationConsistencyError('Foreign activation receipt');
      }
    });

    const stored = await this.step(RenderStage.Plan, async () => {
      const result = await this.plans.readPlan(input.siteId, input.releaseId, input.renderPlanId);

      if (!result) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Published plan not found');
      }

      const { plan } = result;

      if (
        result.siteId !== input.siteId
        || result.releaseId !== input.releaseId
        || plan.siteId !== input.siteId
        || plan.planId !== input.renderPlanId
        || plan.page.siteId !== input.siteId
        || plan.pageId !== plan.page.pageId
        || plan.rendering.delivery !== HtmlDelivery.Request
      ) {
        throw new PublicationConsistencyError('Inconsistent published Request plan');
      }

      return result;
    });
    const { plan } = stored;
    const values = this.sync(RenderStage.Request,
      () =>
        this.output.normalizeRequest(plan.requestParameters,
          input.requestValues ?? {}));

    input.signal?.throwIfAborted();
    const generate = (signal?: AbortSignal): Promise<IPublishedDocument> => this.documents.generate({
      stored, values, ...(input.representation ? { representation: input.representation } : {}),
    }, signal);
    const policy = plan.rendering.requestCache;

    if (
      !policy
      || !this.cache
      || !this.cacheStore
      || !input.path
      || input.sharedCacheAllowed === false
    ) {
      const result = await generate(input.signal);

      return policy ? { ...result, cacheStatus: RequestCacheStatus.Bypass } : result;
    }
    parseRequestCachePolicy(policy);
    const fingerprint = stored.contentFingerprint ?? this.cacheStore.digest(stored);
    const key = this.cacheStore.digest({
      siteId: input.siteId,
      releaseId: input.releaseId,
      planId: plan.planId,
      planDigest: fingerprint,
      path: input.path,
      language: plan.page.language,
      representation: input.representation ?? DocumentRepresentation.Html,
      values: canonical(values),
    });

    return this.step(RenderStage.Cache,
      () => this.cache!.resolve(key, input.siteId, policy.ttlMs, generate, input.signal,
        this.refresh && policy.ttlMs > 20000 ? this.createRefresh(input, values, fingerprint) : undefined));
  }

  private createRefresh(
    input: IRenderPublishedPageInput, values: ITemplateObject, fingerprint: string,
  ): IRequestCacheRefresh {
    const request: IRenderPublishedPageInput = {
      siteId: input.siteId,
      releaseId: input.releaseId,
      renderPlanId: input.renderPlanId,
      requestValues: structuredClone(values),
      ...(input.path ? { path: input.path } : {}),
      ...(input.representation ? { representation: input.representation } : {}),
    };

    return {
      bytes: JSON.stringify(request).length * 4 + 1024,
      generate: (signal) => this.refreshDocument(request, fingerprint, signal),
    };
  }

  private async refreshDocument(request: IRenderPublishedPageInput, fingerprint: string,
    signal: AbortSignal): Promise<IPublishedDocument> {
    signal.throwIfAborted();
    const selected = await this.activation.getActive(request.siteId);

    if (selected?.siteId !== request.siteId || selected.releaseId !== request.releaseId) {
      throw new PublishedDataUnavailableError('Refresh release is no longer active');
    }

    const stored = await this.plans.readPlan(request.siteId, request.releaseId, request.renderPlanId);

    if (
      stored?.siteId !== request.siteId
      || stored.releaseId !== request.releaseId
      || stored.plan.siteId !== request.siteId
      || stored.plan.planId !== request.renderPlanId
      || stored.plan.page.siteId !== request.siteId
      || stored.plan.pageId !== stored.plan.page.pageId
      || stored.plan.rendering.delivery !== HtmlDelivery.Request
      || (stored.contentFingerprint ?? this.cacheStore!.digest(stored)) !== fingerprint
    ) {
      throw new PublicationConsistencyError('Refresh plan identity changed');
    }

    signal.throwIfAborted();
    const document = await this.refresh!.regenerate({
      stored,
      values: request.requestValues ?? {},
      ...(request.representation ? { representation: request.representation } : {}),
    }, signal);

    signal.throwIfAborted();
    const current = await this.activation.getActive(request.siteId);

    if (
      current?.siteId !== request.siteId
      || current.releaseId !== request.releaseId
      || document.releaseId !== request.releaseId
      || document.pageId !== stored.plan.pageId
    ) {
      throw new PublicationConsistencyError('Refresh result is obsolete or foreign');
    }

    return document;
  }
}
