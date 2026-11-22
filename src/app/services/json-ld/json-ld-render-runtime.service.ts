import { RenderStage } from '../../../domain/diagnostics/page-resolution.js';
import { HtmlDelivery, type ITemplateObject, LoaderPhase } from '../../../domain/pages/page-rendering.js';
import type { IRenderedDocument, IRenderPlan } from '../../../domain/publication/render-plan.js';
import type { IBuildJsonLdPage } from '../../../ports/inbound/json-ld/build-json-ld-page.port.js';
import type { IRenderObservationPort } from '../../../ports/outbound/diagnostics/render-observation.port.js';
import type { IJsonLdDocumentPort } from '../../../ports/outbound/json-ld/json-ld-document.port.js';
import type { IRenderRuntime } from '../publication/render-data.service.js';

export class JsonLdRenderRuntimeService implements IRenderRuntime {
  constructor(private readonly runtime: IRenderRuntime, private readonly graphs: IBuildJsonLdPage,
    private readonly document: IJsonLdDocumentPort, private readonly observation?: IRenderObservationPort) {}

  async render(plan: IRenderPlan, preview: boolean, request: ITemplateObject = {},
    phase = LoaderPhase.Request, cancellation?: AbortSignal): Promise<IRenderedDocument> {
    const document = await this.runtime.render(plan, preview, request, phase, cancellation);

    if (!plan.jsonLd || (plan.page.mimeType ?? 'text/html') !== 'text/html') {
      return document;
    }

    const jsonLd = plan.jsonLd;
    const complete = (): IRenderedDocument => {
      const input = {
        ...jsonLd,
        siteId: plan.siteId,
        pageId: plan.pageId,
        templateId: plan.rendering.templateId,
        pageFields: { ...plan.page },
        templateValues: plan.templateValues ?? {},
        snippetValues: document.snippetValues ?? {},
      };
      const deferred = !preview && phase === LoaderPhase.Build && plan.rendering.delivery === HtmlDelivery.Request;

      if (deferred) {
        this.graphs.validateDeferred(input);
      }

      const result = deferred ? null : this.graphs.execute(input);

      return {
        ...document,
        html: deferred ? document.html : this.document.embed(document.html, result?.graph ?? null),
        jsonLd: { input, result },
      };
    };

    return this.observation ? this.observation.sync(RenderStage.JsonLd, complete) : complete();
  }
}
