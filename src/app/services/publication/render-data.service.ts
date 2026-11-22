import type { ITemplateObject, TemplateValue } from '../../../domain/pages/page-rendering.js';
import { LoaderPhase } from '../../../domain/pages/page-rendering.js';
import { PublicationConsistencyError } from '../../../domain/publication/published-document.js';
import type { IRenderedDocument, IRenderPlan } from '../../../domain/publication/render-plan.js';
import { SnippetExecution } from '../../../domain/rendering/snippet.js';
import type { ILoaderExecutionPort } from '../../../ports/outbound/publication/loader-execution.port.js';
import type { ITemplateCompositionPort } from '../../../ports/outbound/publication/template-composition.port.js';
import { SnippetSchedulerService } from './snippet-scheduler.service.js';

export function canonical(value: TemplateValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries: [string, TemplateValue][] = Object.entries(value);

    return `{${entries.sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

export interface IRenderRuntime {
  render(plan: IRenderPlan, preview: boolean, request?: ITemplateObject, phase?: LoaderPhase, signal?: AbortSignal):
  Promise<IRenderedDocument>;
}

import { RenderStage } from '../../../domain/diagnostics/page-resolution.js';
import type { IRenderObservationPort } from '../../../ports/outbound/diagnostics/render-observation.port.js';

export class RenderDataService implements IRenderRuntime {
  constructor(private readonly composition: ITemplateCompositionPort, private readonly loaders: ILoaderExecutionPort,
    private readonly timeoutMs = 10000, private readonly observation?: IRenderObservationPort,
    private readonly scheduler = new SnippetSchedulerService()) {}

  async render(plan: IRenderPlan, preview: boolean, request: ITemplateObject = {},
    phase = LoaderPhase.Request, cancellation?: AbortSignal): Promise<IRenderedDocument> {
    let cacheable = true;
    const pending = new Map<string, Promise<TemplateValue>>();
    const failure = new AbortController();
    const session = this.scheduler.createSession();
    const renderSignal = cancellation ? AbortSignal.any([cancellation, failure.signal]) : failure.signal;
    const compose = (): Promise<IRenderedDocument> => this.composition.compose(plan, plan.buildValues, {
      phase,
      request,
      allowBuildExecution: preview || phase === LoaderPhase.Build,
      scopes: (tasks, signal) => session.scopes(tasks,
        signal ? AbortSignal.any([renderSignal, signal]) : renderSignal),
      schedule: (tasks, signal) => {
        const schedule = (): Promise<void> => session.execute(tasks,
          signal ? AbortSignal.any([renderSignal, signal]) : renderSignal);

        return this.observation?.measure(RenderStage.Scheduling, schedule) ?? schedule();
      },
      read: async (binding, parameters, schedulingSignal) => {
        if (!preview && phase === LoaderPhase.Request && binding.phase === LoaderPhase.Build) {
          throw new PublicationConsistencyError('Frozen Build value is missing from the published plan');
        }
        if (
          !preview
          && phase === LoaderPhase.Request
          && plan.rendering.requestCache
          && !plan.snippetCachePolicies?.[binding.loaderId]
        ) {
          throw new PublicationConsistencyError('Missing frozen Snippet cache contract');
        }

        const key = `${binding.loaderId}:${binding.phase}:${binding.required}:${canonical(parameters)}`;
        let result = pending.get(key);
        const reused = result !== undefined;

        if (!result) {
          const deadline = AbortSignal.timeout(this.timeoutMs);
          const signal = AbortSignal.any([renderSignal, deadline, ...(schedulingSignal ? [schedulingSignal] : [])]);
          const execute = (): Promise<TemplateValue> => this.loaders.execute(binding.loaderId, parameters, {
            siteId: plan.siteId,
            pageId: plan.pageId,
            language: plan.page.language,
            phase: binding.phase,
            preview,
            signal,
            execution: plan.snippetExecutions?.[binding.loaderId] ?? SnippetExecution.Sequential,
            ...(!preview && phase === LoaderPhase.Request && plan.rendering.requestCache ? {
              cachePolicy: plan.snippetCachePolicies?.[binding.loaderId],
            } : {}),
            onUncacheable: () => {
              cacheable = false;
            },
            publishedPages: plan.publishedPages ?? [],
            snippetSources: plan.templates,
          }, binding.required);

          result = Promise.resolve().then(() => this.observation?.measure(RenderStage.Snippet, execute) ?? execute());
          pending.set(key, result);
        }

        return reused ? this.observation?.measure(RenderStage.Deduplication, () => result!) ?? result : result;
      },
    });

    try {
      const rendered = await (this.observation?.measure(RenderStage.Composition, compose) ?? compose());

      return cacheable ? rendered : { ...rendered, cacheable: false };
    } catch (error) {
      failure.abort(error);
      throw error;
    }
  }
}
