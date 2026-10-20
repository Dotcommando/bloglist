import type { IPageReference } from '../../../domain/routing/page-reference.js';

export interface IPageLookupPort {
  findPage(pageId: string): Promise<IPageReference | null>;
}
