import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type { IRenderedDocument } from '../../../domain/publication/render-plan.js';

export interface IPreviewPageInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly pageId: string;
  readonly requestValues?: ITemplateObject;
}

export interface IPreviewResult extends IRenderedDocument {
  readonly previewId: string;
  readonly url: string;
}

export interface IPreviewPage {
  execute(input: IPreviewPageInput): Promise<IPreviewResult>;
}
