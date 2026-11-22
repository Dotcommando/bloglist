import { AsyncLocalStorage } from 'node:async_hooks';

import type { IRenderStageObservation, RenderStage } from '../../../domain/diagnostics/page-resolution.js';
import { StageOutcome } from '../../../domain/diagnostics/page-resolution.js';
import type {
  IRenderObservationSessions, IRenderTrace,
} from '../../../ports/outbound/diagnostics/resolution-observation.port.js';

interface IObservationScope { trace: IRenderTrace; span?: IRenderStageObservation; }

export class RenderObservationAdapter implements IRenderObservationSessions {
  private readonly storage = new AsyncLocalStorage<IObservationScope>();
  private readonly pending = new WeakMap<IRenderTrace, Map<Promise<unknown>, IRenderStageObservation>>();
  private readonly manual = new WeakMap<IRenderTrace, Set<(outcome: StageOutcome) => void>>();

  constructor(private readonly clock: () => number = () => performance.now()) {}

  create(start = this.clock()): IRenderTrace {
    const trace = { start, stages: [], droppedStages: 0 };

    this.pending.set(trace, new Map());
    this.manual.set(trace, new Set());

    return trace;
  }

  run<T>(trace: IRenderTrace, operation: () => Promise<T>): Promise<T> {
    return this.storage.run({ trace }, operation);
  }

  private begin(stage: RenderStage): { scope: IObservationScope;
    started: number;
    finish: (error?: unknown) =>
    void } | null {
    const current = this.storage.getStore();

    if (!current) {
      return null;
    }
    if (current.trace.stages.length >= 256) {
      current.trace.droppedStages++;

      return null;
    }

    const started = this.clock();
    const span = {
      id: current.trace.stages.length + 1,
      parentId: current.span?.id ?? null,
      stage,
      offsetMs: Math.max(0, started - current.trace.start),
      durationMs: 0,
      outcome: StageOutcome.Success,
    };

    current.trace.stages.push(span);

    return {
      scope: { trace: current.trace, span },
      started,
      finish: (error) => {
        span.durationMs = Math.max(0, this.clock() - started);

        if (error !== undefined) {
          span.outcome = error instanceof Error && error.name === 'AbortError' ? StageOutcome.Aborted
            : error instanceof Error && error.name === 'TimeoutError' ? StageOutcome.Timeout : StageOutcome.Failure;
        }
      },
    };
  }

  async measure<T>(stage: RenderStage, operation: () => Promise<T>): Promise<T> {
    const span = this.begin(stage);

    if (!span) {
      return operation();
    }

    const result = this.storage.run(span.scope, async () => {
      try {
        const result = await operation();

        span.finish();

        return result;
      } catch (error) {
        span.finish(error);
        throw error;
      }
    });
    const pending = this.pending.get(span.scope.trace);

    pending?.set(result, span.scope.span!);
    void result.then(() => pending?.delete(result), () => pending?.delete(result));

    return result;
  }

  sync<T>(stage: RenderStage, operation: () => T): T {
    const span = this.begin(stage);

    if (!span) {
      return operation();
    }

    return this.storage.run(span.scope, () => {
      try {
        const result = operation();

        span.finish();

        return result;
      } catch (error) {
        span.finish(error);
        throw error;
      }
    });
  }

  outcome(outcome: StageOutcome): void {
    const span = this.storage.getStore()?.span;

    if (span) {
      Object.assign(span, { outcome });
    }
  }

  start(stage: RenderStage): { finish(outcome?: StageOutcome): void } {
    const span = this.begin(stage);
    let finished = false;
    const finish = (outcome = StageOutcome.Success): void => {
      if (span && !finished) {
        finished = true;
        span.finish();
        Object.assign(span.scope.span!, { outcome });
        this.manual.get(span.scope.trace)?.delete(finish);
      }
    };

    if (span) {
      Object.assign(span.scope.span!, { outcome: StageOutcome.Failure });
      this.manual.get(span.scope.trace)?.add(finish);
    }

    return { finish };
  }

  async waitForCompletion(trace: IRenderTrace, terminalOutcome = StageOutcome.Failure): Promise<void> {
    const pending = this.pending.get(trace);
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (pending?.size) {
        await Promise.race([
          Promise.allSettled([...pending.keys()]),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 2000);
          }),
        ]);
      }
    } finally {
      if (timer) {
        clearTimeout(timer);
      }

      for (const span of pending?.values() ?? []) {
        Object.assign(span, {
          durationMs: Math.max(0, this.clock() - trace.start - span.offsetMs),
          outcome: StageOutcome.Timeout,
        });
      }

      for (const finish of this.manual.get(trace) ?? []) {
        finish(terminalOutcome);
      }
    }
  }
}
