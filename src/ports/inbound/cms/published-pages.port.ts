import type { IPageState } from '../../../domain/pages/page.js';

export interface IGetPublishedPage {
  execute(input: { readonly siteId: string;
    readonly pageId: string;
    readonly releaseId?: string;
    readonly pageVersionId?: string }): Promise<IPageState | null>;
}

export interface IListPageVersions {
  execute(input: { readonly siteId: string; readonly pageId: string }): Promise<readonly {
    readonly pageVersionId: string; readonly page: IPageState;
  }[]>;
}
