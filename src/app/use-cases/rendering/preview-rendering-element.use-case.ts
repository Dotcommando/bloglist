import { ElementUsageKind } from '../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IGetRenderingElement, IPreviewRenderingElement,
} from '../../../ports/inbound/rendering/rendering-elements.port.js';
import type { IElementPagePreview } from '../../../ports/outbound/rendering/element-sources.port.js';

export class PreviewRenderingElementUseCase implements IPreviewRenderingElement {
  constructor(private readonly elements: IGetRenderingElement, private readonly preview: IElementPagePreview) {}

  async execute(input: Parameters<IPreviewRenderingElement['execute']>[0]):
  ReturnType<IPreviewRenderingElement['execute']> {
    const element = await this.elements.execute(input);

    if (element.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Preview source changed');
    }
    if (!element.usages.some((usage) => usage.kind === ElementUsageKind.Page && usage.id === input.pageId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Page does not use this element');
    }

    const result = await this.preview.execute({ siteId: input.siteId, pageId: input.pageId });

    if ((await this.elements.execute(input)).version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Source changed while building the preview');
    }

    return result;
  }
}
