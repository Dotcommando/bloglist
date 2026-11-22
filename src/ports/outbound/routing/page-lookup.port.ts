import type { IPageReference } from '../../../domain/routing/page-reference.js';

export interface IPageLookupPort {
  findPage(siteId: string, pageId: string): Promise<IPageReference | null>;
}
