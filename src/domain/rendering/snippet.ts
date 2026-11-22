import type { LoaderPhase } from '../pages/page-rendering.js';
import type { IParameterContract } from '../publication/render-plan.js';

export enum SnippetExecution { Sequential = 'Sequential', ParallelRead = 'ParallelRead' }

import type { ISnippetCachePolicy } from '../publication/request-cache.policy.js';

export interface ISnippetDescriptor {
  readonly cache?: ISnippetCachePolicy;
  readonly execution?: SnippetExecution;
  readonly id: string;
  readonly parameters: readonly IParameterContract[];
  readonly output: IParameterContract;
  readonly phases: readonly LoaderPhase[];
}

export interface ISnippetSource {
  readonly cache?: ISnippetCachePolicy;
  readonly execution?: SnippetExecution;
  readonly code: string;
  readonly output: IParameterContract;
  readonly phases: readonly LoaderPhase[];
  readonly compiledJavaScript?: string;
}
