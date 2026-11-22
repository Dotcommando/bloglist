import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  IInspectJsonLd, IInspectJsonLdInput, IJsonLdInspection,
} from '../../../ports/inbound/json-ld/inspect-json-ld.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';

export class InspectJsonLdDraftUseCase implements IInspectJsonLd {
  constructor(private readonly access: IPublicationAccessPort, private readonly source: IPublicationSourcePort,
    private readonly composition: ITemplateCompositionPort, private readonly runtime: IRenderRuntime) {}

  async execute(input: IInspectJsonLdInput): Promise<IJsonLdInspection> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const snapshot = await this.source.capture(input.siteId, input.pageId);

    requireCondition(snapshot.siteId === input.siteId, 'Foreign JSON-LD preview source');
    const plan = await this.composition.prepare(snapshot, input.pageId);

    requireCondition(plan.siteId === input.siteId && plan.pageId === input.pageId, 'Foreign JSON-LD preview plan');
    const document = await this.runtime.render(plan, true, {});

    requireCondition(document.pageId === input.pageId, 'Foreign JSON-LD preview document');
    const result = document.jsonLd?.result;

    return { jsonLd: result ? JSON.stringify(result.graph, null, 2) : null, warnings: result?.warnings ?? [] };
  }
}
