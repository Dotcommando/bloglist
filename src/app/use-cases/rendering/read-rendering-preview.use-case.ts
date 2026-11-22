import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IReadRenderingPreview } from '../../../ports/inbound/rendering/read-rendering-preview.port.js';
import type { IPreviewDocuments } from '../../../ports/outbound/rendering/preview-documents.port.js';

export class ReadRenderingPreviewUseCase implements IReadRenderingPreview {
  constructor(private readonly documents: IPreviewDocuments,
    private readonly assertAccess: (siteId: string, pageId: string) => Promise<void>) {}

  async execute(input: Parameters<IReadRenderingPreview['execute']>[0]): ReturnType<IReadRenderingPreview['execute']> {
    const document = await this.documents.read(input.previewId, input.actorId);

    if (!document) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Preview unavailable');
    }
    await this.assertAccess(document.siteId, document.pageId);

    return document;
  }
}
