import { PublishedDataUnavailableError } from '../../../domain/publication/published-document.js';

interface IAdmission {
  readonly grant: () => void;
  readonly reject: (error: unknown) => void;
  readonly cleanup: () => void;
}

export class SnippetAdmissionService {
  private active = 0;
  private readonly queue: IAdmission[] = [];
  private closed = false;

  constructor(private readonly limit: number, private readonly queueLimit: number,
    private readonly queueWaitMs: number) {}

  snapshot(): { active: number; queued: number } {
    return { active: this.active, queued: this.queue.length };
  }

  async acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();

    if (this.closed) {
      throw new PublishedDataUnavailableError();
    }
    if (this.active < this.limit) {
      this.active++;

      return () => this.release();
    }
    if (this.queue.length >= this.queueLimit) {
      throw new PublishedDataUnavailableError();
    }

    return new Promise((resolve, reject) => {
      const remove = (): void => {
        const index = this.queue.indexOf(admission);

        if (index >= 0) {
          this.queue.splice(index, 1);
        }
        admission.cleanup();
      };
      const abort = (): void => {
        remove();
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        remove();
        reject(new PublishedDataUnavailableError());
      }, this.queueWaitMs);
      const admission: IAdmission = {
        grant: () => {
          resolve(() => this.release());
        },
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        },
      };

      this.queue.push(admission);
      signal.addEventListener('abort', abort, { once: true });

      if (signal.aborted) {
        abort();
      }
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();

    if (next) {
      next.cleanup();
      this.active++;
      next.grant();
    }
  }

  close(): void {
    this.closed = true;

    for (const queued of this.queue.splice(0)) {
      queued.cleanup();
      queued.reject(new PublishedDataUnavailableError());
    }
  }
}
