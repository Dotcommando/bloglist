import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation, StageOutcome,
} from '../../../../../domain/diagnostics/page-resolution.js';
import type {
  IPageResolutionSink, IRenderObservationSessions,
} from '../../../../../ports/outbound/diagnostics/resolution-observation.port.js';

export interface IHttpResolutionContext {
  siteId?: string;
  path?: string;
  delivery: PageDelivery;
  representation: ResolutionRepresentation;
  excluded: boolean;
}

export class PageResolutionObserver {
  constructor(private readonly observation: IRenderObservationSessions, private readonly sink: IPageResolutionSink,
    private readonly clock: () =>
    number = () =>
      performance.now(),
    private readonly now: () =>
    Date = () =>
      new Date()) {}

  private readonly arrivals = new WeakMap<IncomingMessage, { started: number; startedAt: Date }>();

  arrive(request: IncomingMessage): void {
    this.arrivals.set(request, { started: this.clock(), startedAt: this.now() });
  }

  async handle(request: IncomingMessage, response: ServerResponse,
    operation: (context: IHttpResolutionContext) => Promise<void>): Promise<void> {
    const arrival = this.arrivals.get(request);

    this.arrivals.delete(request);
    const started = arrival?.started ?? this.clock();
    const startedAt = arrival?.startedAt ?? this.now();
    const trace = this.observation.create(started);
    const context: IHttpResolutionContext = {
      delivery: PageDelivery.Unresolved,
      representation: ResolutionRepresentation.Html,
      excluded: false,
    };
    let ready: number | undefined;
    let completed: number | undefined;
    let aborted = false;
    let settled = false;
    let submitted = false;
    const markReady = (): void => {
      ready ??= this.clock() - started;
    };
    const write = response.write;
    const end = response.end;

    response.write = (chunk: unknown, encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void): boolean => {
      markReady();

      return Reflect.apply(write, response, [chunk, encoding, callback]);
    };
    response.end = (chunk?: unknown, encoding?: BufferEncoding | (() => void),
      callback?: () => void): ServerResponse => {
      markReady();

      return Reflect.apply(end, response, [chunk, encoding, callback]);
    };
    const submit = (): void => {
      if (!settled || completed === undefined || submitted) {
        return;
      }
      submitted = true;
      response.removeListener('finish', finish);
      response.removeListener('close', close);
      response.write = write;
      response.end = end;

      if (context.excluded || !context.siteId || !context.path || !['GET', 'HEAD'].includes(request.method ?? '')) {
        return;
      }

      const durationMs = Math.max(0, Math.min(ready ?? completed, completed));
      const completionMs = Math.max(durationMs, completed);
      const status = response.statusCode;
      const outcome = aborted ? ResolutionOutcome.Aborted : status < 300 || status === 304 ? ResolutionOutcome.Success
        : status < 400 ? ResolutionOutcome.Redirect : status === 404 ? ResolutionOutcome.NotFound
          : status === 400
            ? ResolutionOutcome.Invalid
            : status === 503
              ? ResolutionOutcome.Unavailable
              : ResolutionOutcome.Failure;

      setImmediate(() => {
        const terminalOutcome = aborted ? StageOutcome.Aborted : StageOutcome.Failure;

        void Promise.resolve().then(() => this.observation.waitForCompletion(trace, terminalOutcome)).then(() => {
          try {
            this.sink.submit({
              siteId: context.siteId!,
              path: context.path!,
              startedAt,
              durationMs,
              completionMs,
              method: request.method === 'HEAD' ? ResolutionMethod.Head : ResolutionMethod.Get,
              representation: context.representation,
              delivery: context.delivery,
              statusCode: status,
              outcome,
              stages: trace.stages.map((stage) => ({ ...stage })),
              droppedStages: trace.droppedStages,
            });
          } catch { /* Diagnostics never change public delivery. */ }
        }, () => {});
      });
    };
    const finish = (): void => {
      completed ??= this.clock() - started;
      submit();
    };
    const close = (): void => {
      if (completed === undefined) {
        aborted = !response.writableFinished;
        completed = this.clock() - started;
      }
      submit();
    };

    response.once('finish', finish);
    response.once('close', close);

    try {
      await this.observation.run(trace, () => operation(context));
    } finally {
      settled = true;
      submit();
    }
  }
}
