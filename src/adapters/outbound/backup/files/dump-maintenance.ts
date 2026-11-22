import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';

/** Drains this HTTP process before a complete snapshot or replacement. */
export class DumpMaintenance {
  constructor(private readonly invalidate?: () => void) {}

  private active = 0;
  private exclusive = false;
  private drained: (() => void) | null = null;
  private failed = false;
  private readable = false;

  get captureActive(): boolean {
    return this.exclusive && this.readable;
  }

  enter(readOnly = false): () => void {
    if (this.failed || this.exclusive && !(this.readable && readOnly)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site maintenance in progress');
    }
    this.active++;
    let released = false;

    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active--;

      if (!this.active) {
        this.drained?.();
      }
    };
  }

  failClosed(): void {
    this.failed = true;
  }

  async run<T>(action: () => Promise<T>, allowReads = false): Promise<T> {
    if (this.exclusive || this.failed) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site maintenance in progress');
    }
    this.exclusive = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      if (this.active) {
        await new Promise<void>((resolve, reject) => {
          this.drained = resolve;
          timeout = setTimeout(() => reject(new BusinessError(BusinessErrorCode.Conflict,
            'Active requests did not drain')), 30000);
        });
      }

      this.invalidate?.();
      this.readable = allowReads;

      return await action();
    } finally {
      this.invalidate?.();
      clearTimeout(timeout);
      this.drained = null;
      this.exclusive = false;
      this.readable = false;
    }
  }
}
