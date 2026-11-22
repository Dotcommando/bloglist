import type { Page } from '../../../domain/pages/page.js';
import type { IPageRendering } from '../../../domain/pages/page-rendering.js';

export interface IConfigurePageRenderingInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly pageId: string;
  readonly rendering: IPageRendering;
}

export interface IConfigurePageRendering {
  execute(input: IConfigurePageRenderingInput): Promise<Page>;
}
