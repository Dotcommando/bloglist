import type { IRenderingPreviewDocument } from '../../../domain/rendering/rendering-preview.js';

export interface IReadRenderingPreview {
  execute(input: { readonly previewId: string; readonly actorId: string }): Promise<IRenderingPreviewDocument>;
}
