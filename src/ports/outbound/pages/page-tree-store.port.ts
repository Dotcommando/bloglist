import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IPageState, Page } from '../../../domain/pages/page.js';

export interface IPageTreeStore {
  /** Atomically check the captured page and owned acyclic parent graph, preserving order and URLs. */
  move(expected: IPageState, parentPageId: string | null, hookChange?: IHookCommitIntent): Promise<Page>;
}
