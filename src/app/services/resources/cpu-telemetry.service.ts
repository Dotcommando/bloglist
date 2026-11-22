import type { ICpuCounters, ICpuCountersPort, ICpuLoadSample, ICpuTelemetrySubscriber } from
  '../../../ports/outbound/resources/cpu-counters.port.js';

/** Keeps only successive counters. Chart history belongs exclusively to each browser. */
export class CpuTelemetryService {
  private readonly subscribers = new Set<ICpuTelemetrySubscriber>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private previous: ICpuCounters | null = null;
  private generation = 0;
  private sampling = false;

  constructor(private readonly counters: ICpuCountersPort) {}

  subscribe(subscriber: ICpuTelemetrySubscriber): () => void {
    if (this.subscribers.size >= 16) {
      throw new Error('CPU telemetry subscriber limit exceeded');
    }
    this.subscribers.add(subscriber);

    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.sample();
      }, 1000);
      void this.sample();
    }

    return () => this.remove(subscriber);
  }

  close(): void {
    for (const subscriber of this.subscribers) {
      subscriber.close();
      this.remove(subscriber);
    }
  }

  private remove(subscriber: ICpuTelemetrySubscriber): void {
    this.subscribers.delete(subscriber);

    if (!this.subscribers.size) {
      if (this.timer) {
        clearInterval(this.timer);
      }
      this.timer = null;
      this.previous = null;
      this.generation++;
    }
  }

  private async sample(): Promise<void> {
    if (this.sampling || !this.subscribers.size) {
      return;
    }
    this.sampling = true;
    const generation = this.generation;

    try {
      await Promise.all([...this.subscribers].map(async (subscriber) => {
        try {
          await subscriber.authorize();
        } catch {
          subscriber.close();
          this.remove(subscriber);
        }
      }));

      if (generation !== this.generation || !this.subscribers.size) {
        return;
      }

      let sample: ICpuLoadSample;

      try {
        const current = await this.counters.read();

        if (generation !== this.generation) {
          return;
        }

        const previous = this.previous;
        const intervalMs = previous ? current.monotonicMs - previous.monotonicMs : null;
        const valid = previous && intervalMs !== null && intervalMs >= 500 && intervalMs <= 2500
          && current.source === previous.source && current.cores.length === previous.cores.length;

        sample = {
          timestamp: current.timestamp,
          source: current.source,
          logicalCpuCount: current.cores.length,
          intervalMs: valid ? intervalMs : null,
          usage: current.cores.map((core, index) => {
            const before = valid ? previous.cores[index] : null;

            if (!before || core.total <= before.total || core.idle < before.idle) {
              return null;
            }

            const total = core.total - before.total;
            const idle = core.idle - before.idle;

            return idle <= total ? Math.round((1 - idle / total) * 1000) / 10 : null;
          }),
        };
        this.previous = current;
      } catch {
        sample = {
          timestamp: new Date().toISOString(),
          source: this.previous?.source ?? 'Unavailable',
          logicalCpuCount: this.previous?.cores.length ?? 0,
          intervalMs: null,
          usage: this.previous?.cores.map(() => null) ?? [],
        };
        this.previous = null;
      }

      for (const subscriber of this.subscribers) {
        try {
          subscriber.send(sample);
        } catch {
          subscriber.close();
          this.remove(subscriber);
        }
      }
    } finally {
      this.sampling = false;
    }
  }
}
