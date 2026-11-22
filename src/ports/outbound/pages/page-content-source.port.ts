import type { IPageState } from '../../../domain/pages/page.js';

export interface IPageContentSourcePort {
  readWorking(siteId: string, pageId: string): Promise<IPageState | null>;
  readPublished(siteId: string): Promise<readonly IPageState[]>;
}
