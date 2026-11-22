import { type IStaticPublishedRoute, PublishedRouteKind } from '../../../domain/publication/published-route.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  IPreviewMarkdownDraft, IPreviewMarkdownDraftInput,
} from '../../../ports/inbound/publication/preview-markdown-draft.port.js';
import type { IFrontendBuildPort } from '../../../ports/outbound/publication/frontend-build.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';

export class PreviewMarkdownDraftUseCase implements IPreviewMarkdownDraft {
  constructor(private readonly access: IPublicationAccessPort, private readonly source: IPublicationSourcePort,
    private readonly composition: ITemplateCompositionPort, private readonly runtime: IRenderRuntime,
    private readonly frontend: IFrontendBuildPort, private readonly values: IPublicationValuesPort) {}

  async execute(input: IPreviewMarkdownDraftInput): Promise<{ readonly markdown: string }> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const snapshot = await this.source.capture(input.siteId, input.pageId);

    requireCondition(snapshot.siteId === input.siteId, 'Foreign preview source');
    const plan = await this.composition.prepare(snapshot, input.pageId);

    requireCondition(plan.siteId === input.siteId && plan.pageId === input.pageId, 'Foreign preview plan');
    const document = await this.runtime.render(plan, true, {});

    requireCondition(document.pageId === input.pageId, 'Foreign preview document');
    const result = await this.frontend.build({
      releaseId: this.values.nextReleaseId(), snapshot, documents: [document], requestPlans: [],
    });
    const route = result.manifest.routes.find((item): item is IStaticPublishedRoute =>
      item.kind === PublishedRouteKind.Static
      && item.pageId === input.pageId);
    const file = result.artifacts.find((item) => item.path === route?.markdownPath);

    requireCondition(file?.public === true && file.mimeType === 'text/markdown', 'Markdown preview unavailable');
    const chunks: Uint8Array[] = [];
    let size = 0;

    for await (const chunk of file!.content.bytes) {
      size += chunk.byteLength;
      chunks.push(chunk);
    }
    requireCondition(size === file!.byteSize, 'Corrupt Markdown preview');

    return { markdown: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) };
  }
}
