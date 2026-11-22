import type { IPublicationSnapshot } from '../../../domain/publication/render-plan.js';

export interface IPublicationSourcePort {
  capture(siteId: string, previewPageId?: string): Promise<IPublicationSnapshot>;
}
