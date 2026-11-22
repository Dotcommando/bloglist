import type {
  IDataLoaderBinding,
  ITemplateObject,
  LoaderPhase,
  TemplateValue,
} from '../../../domain/pages/page-rendering.js';
import type { IPublicationSnapshot, IRenderedDocument, IRenderPlan } from '../../../domain/publication/render-plan.js';
import type { ISnippetExecutionNode } from '../../../domain/rendering/snippet-execution.policy.js';

export interface ISnippetExecutionTask extends ISnippetExecutionNode {
  run(signal: AbortSignal): Promise<void>;
}

export interface IRenderExecution {
  readonly schedule?: (tasks: readonly ISnippetExecutionTask[], signal?: AbortSignal) => Promise<void>;
  readonly scopes?: (tasks: readonly ISnippetExecutionTask[], signal?: AbortSignal) => Promise<void>;
  readonly phase: LoaderPhase;
  readonly request: ITemplateObject;
  readonly allowBuildExecution?: boolean;
  readonly read: (binding: IDataLoaderBinding, parameters: ITemplateObject, signal?: AbortSignal) =>
  Promise<TemplateValue>;
}

export interface ITemplateCompositionPort {
  prepare(snapshot: IPublicationSnapshot, pageId: string): Promise<IRenderPlan>;
  compose(plan: IRenderPlan, values: ITemplateObject, execution: IRenderExecution): Promise<IRenderedDocument>;
}
