import type { IRenderingPreviewDocument } from '../../../domain/rendering/rendering-preview.js';

export interface IPreviewDocuments {
  read(previewId: string, actorId: string): Promise<IRenderingPreviewDocument | null>;
}
