import { ReleaseState } from '../../../domain/publication/publication-release.js';
import { PublicationConsistencyError } from '../../../domain/publication/published-document.js';
import { PublishedRouteKind } from '../../../domain/publication/published-route.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IInspectJsonLd, IInspectJsonLdInput, IJsonLdInspection,
} from '../../../ports/inbound/json-ld/inspect-json-ld.port.js';
import type { IGetPublishedArtifact } from '../../../ports/inbound/publication/get-published-artifact.port.js';
import type { IRenderPublishedPage } from '../../../ports/inbound/publication/render-published-page.port.js';
import type { IJsonLdInspectionPort } from '../../../ports/outbound/json-ld/json-ld-inspection.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';

export class InspectJsonLdPublishedUseCase implements IInspectJsonLd {
  constructor(private readonly access: IPublicationAccessPort, private readonly activation: IReleaseActivationPort,
    private readonly store: IPublicationStorePort, private readonly render: IRenderPublishedPage,
    private readonly artifacts: IGetPublishedArtifact, private readonly inspection: IJsonLdInspectionPort) {}

  async execute(input: IInspectJsonLdInput): Promise<IJsonLdInspection> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const active = await this.activation.getActive(input.siteId);

    if (!active) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Published page is unavailable');
    }
    if (active.siteId !== input.siteId) {
      throw new PublicationConsistencyError('Foreign active publication');
    }

    const release = await this.store.read(input.siteId, active.releaseId, true);

    if (
      release?.siteId !== input.siteId
      || release.releaseId !== active.releaseId
      || release.state !== ReleaseState.Ready
      || !release.manifest
    ) {
      throw new PublicationConsistencyError('Active publication is unavailable');
    }

    const route = release.manifest.routes.find((item) => item.kind !== PublishedRouteKind.Redirect
      && item.pageId === input.pageId);

    if (!route || route.kind === PublishedRouteKind.Redirect) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Published page is unavailable');
    }
    if (route.kind === PublishedRouteKind.Request) {
      const document = await this.render.execute({
        siteId: input.siteId,
        releaseId: active.releaseId,
        renderPlanId: route.renderPlanId,
      });

      if (document.releaseId !== active.releaseId || document.pageId !== input.pageId) {
        throw new PublicationConsistencyError('Foreign published page');
      }

      return { jsonLd: this.inspection.read(document.html), warnings: [] };
    }

    const artifact = await this.artifacts.execute({
      siteId: input.siteId,
      releaseId: active.releaseId,
      path: route.documentPath,
    });

    if (artifact?.metadata.mimeType !== 'text/html' || artifact.releaseId !== active.releaseId) {
      throw new PublicationConsistencyError('Published HTML is unavailable');
    }

    let size = 0;
    let html = '';
    const decoder = new TextDecoder('utf-8', { fatal: true });

    for await (const chunk of artifact.content.bytes) {
      size += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });
    }

    if (size !== artifact.content.byteSize) {
      throw new PublicationConsistencyError('Incomplete published HTML');
    }

    return { jsonLd: this.inspection.read(html + decoder.decode()), warnings: [] };
  }
}
