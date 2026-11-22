import { RenderStage, StageOutcome } from '../../../../domain/diagnostics/page-resolution.js';
import type { ITemplateObject, TemplateValue } from '../../../../domain/pages/page-rendering.js';
import { SnippetExecution } from '../../../../domain/rendering/snippet.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { ICmsSnippetApiPort } from '../../../../ports/outbound/cms/snippet-api.port.js';
import type { IRenderObservationPort } from '../../../../ports/outbound/diagnostics/render-observation.port.js';
import type { IDataLoader, ILoaderContext } from '../../../../ports/outbound/publication/data-loader.port.js';
import type { ILoaderExecutionPort } from '../../../../ports/outbound/publication/loader-execution.port.js';
import { validateParameters, validateValue } from './parameters.js';
import { snippetRegistrations } from './script-snippet.adapter.js';
import { SnippetWorkerPool } from './snippet-worker-pool.js';

export class LoaderExecutionAdapter implements ILoaderExecutionPort {
  constructor(private readonly loaders: readonly IDataLoader[],
    private readonly cms?: ICmsSnippetApiPort,
    private readonly observation?: IRenderObservationPort,
    private readonly pool = new SnippetWorkerPool()) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.onModuleDestroy();
  }

  private sync<T>(stage: RenderStage, operation: () => T): T {
    return this.observation ? this.observation.sync(stage, operation) : operation();
  }

  validate(loaderId: string, phase: ILoaderContext['phase'], required: boolean): void {
    const loader = this.loaders.find((item) => item.id === loaderId);

    requireCondition(loader?.phases.includes(phase) === true, `Unknown/unsupported loader: ${loaderId}`);
    requireCondition(required || loader?.fallback !== undefined, 'Optional loader needs an explicit fallback');
  }

  async execute(loaderId: string, input: ITemplateObject, context: ILoaderContext, required:
  boolean): Promise<TemplateValue> {
    const loader = snippetRegistrations(context.snippetSources ?? [], this.loaders, this.observation, this.pool)
      .find((item) => item.id === loaderId);

    requireCondition(loader?.phases.includes(context.phase) === true, `Unknown/unsupported Snippet: ${loaderId}`);
    requireCondition(required || loader?.fallback !== undefined, 'Optional Snippet needs an explicit fallback');

    if (!loader) {
      throw new Error('Unknown Snippet');
    }

    const parameters = this.sync(RenderStage.Input, () => validateParameters(loader.parameters, input));

    try {
      context.signal.throwIfAborted();
      const parallel = (context.execution ?? loader.execution) === SnippetExecution.ParallelRead;
      const readOnly = parallel || context.cachePolicy !== undefined;

      requireCondition(!context.cachePolicy || loader.cache?.scope === context.cachePolicy.scope
        && loader.cache.maxAgeMs >= context.cachePolicy.maxAgeMs,
      'Published Snippet cache contract is unsupported');

      requireCondition(!parallel || loader.execution === SnippetExecution.ParallelRead,
        'Published Snippet execution contract is unsupported');
      requireCondition(!readOnly || this.cms !== undefined || context.cms === undefined,
        'Parallel reads require a scoped query-only CMS client');
      const scopedContext = this.cms ? {
        ...context, cms: this.cms.forSnippet(context.siteId, loaderId, readOnly),
      } : context;
      const result = await new Promise<TemplateValue>((resolve, reject) => {
        const abort = (): void => reject(context.signal.reason);

        context.signal.addEventListener('abort', abort, { once: true });
        loader.read(parameters, scopedContext).then(resolve, reject).finally(() =>
          context.signal.removeEventListener('abort', abort));
      });

      return this.sync(RenderStage.Output, () => validateValue(loader.output, result));
    } catch (error) {
      if (!required && loader.fallback !== undefined) {
        context.onUncacheable?.();
        this.observation?.outcome(StageOutcome.Fallback);

        return this.sync(RenderStage.Output, () => validateValue(loader.output, loader.fallback!));
      }
      throw error;
    }
  }
}
