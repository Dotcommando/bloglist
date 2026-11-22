import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  IPreviewPage,
  IPreviewPageInput,
  IPreviewResult,
} from '../../../ports/inbound/publication/preview-page.port.js';
import type { IFrontendBuildPort } from '../../../ports/outbound/publication/frontend-build.port.js';
import type { IPreviewDeliveryPort } from '../../../ports/outbound/publication/preview-delivery.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type { IPublicationValuesPort } from '../../../ports/outbound/publication/publication-values.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import type { IRenderRuntime } from '../../services/publication/render-data.service.js';

export class PreviewPageUseCase implements IPreviewPage {
  constructor(private readonly access: IPublicationAccessPort, private readonly source: IPublicationSourcePort,
    private readonly composition: ITemplateCompositionPort, private readonly runtime: IRenderRuntime,
    private readonly frontend: IFrontendBuildPort, private readonly delivery: IPreviewDeliveryPort,
    private readonly values: IPublicationValuesPort) {}

  async execute(input: IPreviewPageInput): Promise<IPreviewResult> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const snapshot = await this.source.capture(input.siteId, input.pageId);

    requireCondition(snapshot.siteId === input.siteId, 'Foreign preview source');
    const plan = await this.composition.prepare(snapshot, input.pageId);

    requireCondition(plan.siteId === input.siteId && plan.pageId === input.pageId, 'Foreign preview plan');
    const document = await this.runtime.render(plan, true, input.requestValues ?? {});

    requireCondition(document.pageId === input.pageId, 'Foreign preview document');
    const build = await this.frontend.build({
      releaseId: this.values.nextReleaseId(),
      snapshot,
      documents: [document],
      requestPlans: [],
    });

    return this.delivery.present(document, build);
  }
}
