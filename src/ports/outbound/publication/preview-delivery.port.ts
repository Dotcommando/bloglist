import type { IRenderedDocument } from '../../../domain/publication/render-plan.js';
import type { IPreviewResult } from '../../inbound/publication/preview-page.port.js';
import type { IBuiltPublication } from './frontend-build.port.js';

export interface IPreviewDeliveryPort {
  present(document: IRenderedDocument, build: IBuiltPublication): Promise<IPreviewResult>;
}
