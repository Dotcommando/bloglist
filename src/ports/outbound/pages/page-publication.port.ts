import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IPageState, Page } from '../../../domain/pages/page.js';
import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type { PublishedVersionPosition } from '../../../domain/pages/published-page-version.js';

export interface IPagePublicationPort {
  publish(expected: IPageState, at: Date, hookChange?: IHookCommitIntent, tvValues?: ITemplateObject): Promise<Page>;
  versions(siteId: string, pageId: string): Promise<readonly IPageState[]>;
  /** Guard the captured draft and selected retained position; never modify publication history. */
  restore(expected: IPageState, selected: IPageState, position: PublishedVersionPosition, draft:
  Page, at: Date, hookChange?: IHookCommitIntent): Promise<Page>;
}
