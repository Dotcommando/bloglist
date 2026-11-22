import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IPageState, Page } from '../../../domain/pages/page.js';

export interface IPageArchivalPort {
  /** Atomically compare the captured page and change only status/time. */
  archive(expected: IPageState, hookChange?: IHookCommitIntent): Promise<Page>;
}
