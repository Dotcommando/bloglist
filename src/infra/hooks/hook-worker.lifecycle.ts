import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { IProcessHookDeliveries } from '../../ports/inbound/hooks/hook-execution.port.js';

export class HookWorkerLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private active: Promise<unknown> | null = null;
  private failure: unknown = null;

  constructor(private readonly processor: IProcessHookDeliveries, private readonly enter: () => () => void,
    private readonly invalidate?: () => void) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      if (this.active) {
        return;
      }

      let release: () => void;

      try {
        release = this.enter();
      } catch {
        return;
      }
      this.active = Promise.resolve().then(() => this.processor.execute({ maximum: 20 })).then((result) => {
        if (result.dispatched || result.processed) {
          this.invalidate?.();
        }
      }).catch(() => {
        this.invalidate?.();
        Logger.warn('Hook worker cycle could not complete', 'Hooks');
      }).finally(() => {
        try {
          release();
        } finally {
          this.active = null;
        }
      }).catch((error: unknown) => {
        this.failure = error;

        if (this.timer) {
          clearInterval(this.timer);
        }
        Logger.error('Hook worker stopped after a coordination failure', 'Hooks');
      });
    }, 500);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.active;

    if (this.failure) {
      throw this.failure;
    }
  }
}
