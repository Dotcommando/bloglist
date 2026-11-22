import type { IPageResolutionObservation } from '../../../domain/diagnostics/page-resolution.js';
import type { IRecordPageResolution } from '../../../ports/inbound/diagnostics/record-page-resolution.port.js';
import type {
  IPageResolutionSink, IResolutionSinkStatus,
} from '../../../ports/outbound/diagnostics/resolution-observation.port.js';

interface ISiteLoss { dropped: number; failed: number; pending: number; }

export class DeferredResolutionSink implements IPageResolutionSink {
  private readonly queue: IPageResolutionObservation[] = [];
  private readonly losses = new Map<string, ISiteLoss>();
  private active = false;
  private closing = false;

  constructor(private readonly operation: IRecordPageResolution, private readonly capacity = 4096) {}

  private loss(siteId: string): ISiteLoss {
    let value = this.losses.get(siteId);

    if (!value) {
      value = {
        dropped: 0,
        failed: 0,
        pending: 0,
      };
      this.losses.set(siteId,
        value);
    }

    return value;
  }

  status(siteId: string): IResolutionSinkStatus {
    return { ...this.loss(siteId) };
  }

  submit(observation: IPageResolutionObservation): void {
    const loss = this.loss(observation.siteId);

    if (this.closing || this.queue.length + Number(this.active) >= this.capacity) {
      loss.dropped++;

      return;
    }
    this.queue.push(observation);
    loss.pending++;
    this.schedule();
  }

  private schedule(): void {
    if (this.active || !this.queue.length) {
      return;
    }
    this.active = true;
    setImmediate(() => {
      void this.write();
    });
  }

  private async write(): Promise<void> {
    const record = this.queue.shift()!;
    const loss = this.loss(record.siteId);

    try {
      await this.operation.execute(record);
    } catch {
      loss.failed++;
    } finally {
      loss.pending--;
      this.active = false;
      this.schedule();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    const deadline = performance.now() + 2000;

    while ((this.active || this.queue.length) && performance.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    for (const record of this.queue.splice(0)) {
      const loss = this.loss(record.siteId);

      loss.pending--;
      loss.dropped++;
    }
  }
}
