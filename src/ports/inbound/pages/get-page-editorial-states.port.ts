import type { IPageState } from '../../../domain/pages/page.js';

export interface IPageEditorialState {
  readonly pageId: string;
  readonly hasPublishedVersion: boolean;
  readonly changedFields: readonly string[];
}

export interface IPageEditorialStates {
  readonly releaseId: string | null;
  readonly pages: readonly IPageEditorialState[];
  readonly publishedPage: IPageState | null;
  readonly robotsHasUnpublishedChanges: boolean;
}

export interface IGetPageEditorialStates {
  execute(input: { readonly siteId: string; readonly pageId?: string }): Promise<IPageEditorialStates>;
}
