import { RenderStage } from '../../../domain/diagnostics/page-resolution.js';
import { LoaderPhase } from '../../../domain/pages/page-rendering.js';
import {
  DocumentRepresentation, type IPublishedDocument, PublicationConsistencyError, PublishedDataUnavailableError,
} from '../../../domain/publication/published-document.js';
import type { IRenderedDocument } from '../../../domain/publication/render-plan.js';
import type { IRenderObservationPort } from '../../../ports/outbound/diagnostics/render-observation.port.js';
import type { IDocumentOutputPort } from '../../../ports/outbound/publication/document-output.port.js';
import type { IMarkdownConversionPort } from '../../../ports/outbound/publication/markdown-conversion.port.js';
import type { IRequestDocumentGeneration } from '../../../ports/outbound/publication/request-document-refresh.port.js';
import type { IRenderRuntime } from './render-data.service.js';

/** Shared complete-document behavior for public delivery and background refresh. */
export class PublishedDocumentRenderingService {
  constructor(private readonly runtime: IRenderRuntime, private readonly output: IDocumentOutputPort,
    private readonly markdown: IMarkdownConversionPort, private readonly observation?: IRenderObservationPort) {}

  private step<T>(stage: RenderStage, action: () => Promise<T>): Promise<T> {
    return this.observation?.measure(stage, action) ?? action();
  }

  async generate(input: IRequestDocumentGeneration, signal?: AbortSignal): Promise<IPublishedDocument> {
    const { plan, assets, releaseId } = input.stored;
    let document: IRenderedDocument;

    try {
      document = await this.step(RenderStage.Runtime, async () => {
        const rendered = await this.runtime.render(plan, false, input.values, LoaderPhase.Request, signal);

        if (rendered.pageId !== plan.pageId) {
          throw new PublicationConsistencyError('Foreign rendered page');
        }

        return rendered;
      });
    } catch (error) {
      if (error instanceof PublicationConsistencyError || signal?.aborted) {
        throw error;
      }
      throw new PublishedDataUnavailableError('Published data is unavailable', { cause: error });
    }

    signal?.throwIfAborted();
    const output = await this.step(RenderStage.Assets, () => this.output.complete(document.html, assets));
    const identity = { releaseId, pageId: plan.pageId };
    const convert = (): string => this.markdown.toMarkdown(output.html);
    const result = input.representation === DocumentRepresentation.Markdown
      ? { ...output, ...identity, markdown: this.observation?.sync(RenderStage.Markdown, convert) ?? convert() }
      : { ...output, ...identity };

    signal?.throwIfAborted();

    return document.cacheable === false ? { ...result, cacheable: false } : result;
  }
}
