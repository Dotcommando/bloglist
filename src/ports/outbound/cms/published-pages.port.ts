import type { IPageState } from '../../../domain/pages/page.js';

export interface ICmsPublishedPagesPort {
  readRelease(siteId: string, pageId: string, releaseId?: string): Promise<IPageState | null>;
  versions(siteId: string, pageId: string): Promise<readonly {
    readonly pageVersionId: string;
    readonly page: IPageState;
  }[]>;
}
