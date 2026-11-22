import { ReleaseState } from '../../../domain/publication/publication-release.js';
import { DocumentRepresentation, PublicationConsistencyError } from '../../../domain/publication/published-document.js';
import { PublishedRouteKind } from '../../../domain/publication/published-route.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetPublishedArtifact } from '../../../ports/inbound/publication/get-published-artifact.port.js';
import type {
  IPreviewMarkdownPublished, IPreviewMarkdownPublishedInput,
} from '../../../ports/inbound/publication/preview-markdown-published.port.js';
import type { IRenderPublishedPage } from '../../../ports/inbound/publication/render-published-page.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IPublicationStorePort } from '../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';

export class PreviewMarkdownPublishedUseCase implements IPreviewMarkdownPublished {
  constructor(private readonly access: IPublicationAccessPort, private readonly activation: IReleaseActivationPort,
    private readonly store: IPublicationStorePort, private readonly render: IRenderPublishedPage,
    private readonly artifacts: IGetPublishedArtifact) {}

  async execute(input: IPreviewMarkdownPublishedInput): Promise<{ readonly markdown: string }> {
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
        representation: DocumentRepresentation.Markdown,
      });

      if (
        document.releaseId !== active.releaseId
        || document.pageId !== input.pageId
        || document.markdown === undefined
      ) {
        throw new PublicationConsistencyError('Published Markdown is inconsistent');
      }

      return { markdown: document.markdown };
    }
    if (!route.markdownPath) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Published Markdown is unavailable');
    }

    const artifact = await this.artifacts.execute({
      siteId: input.siteId, releaseId: active.releaseId, path: route.markdownPath,
    });

    if (artifact?.metadata.mimeType !== 'text/markdown' || artifact.releaseId !== active.releaseId) {
      throw new PublicationConsistencyError('Published Markdown is unavailable');
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    let markdown = '';
    let size = 0;

    for await (const chunk of artifact.content.bytes) {
      size += chunk.byteLength;
      markdown += decoder.decode(chunk, { stream: true });
    }

    if (size !== artifact.content.byteSize) {
      throw new PublicationConsistencyError('Published Markdown is incomplete');
    }

    return { markdown: markdown + decoder.decode() };
  }
}
