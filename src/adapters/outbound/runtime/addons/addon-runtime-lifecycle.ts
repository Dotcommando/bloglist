import { AddonShutdownReason, type IAddonShutdownContext, type IAddonShutdownRequest }
  from '@zarya/addon-contracts/addons';

import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';

export class AddonRuntimeLifecycle {
  private readonly active = new Set<Promise<PromiseSettledResult<unknown>[]>>();
  private stopping: Promise<void> | null = null;
  private notification: Promise<void> | null = null;

  constructor(private readonly shutdownHook?: (context: IAddonShutdownContext) => Promise<void>,
    private readonly dispose?: () => Promise<void>) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.stopping) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Add-on is stopping');
    }

    const task = Promise.resolve().then(work);
    const observed = Promise.allSettled([task]);

    this.active.add(observed);

    try {
      return await task;
    } finally {
      this.active.delete(observed);
    }
  }

  notify(request: IAddonShutdownRequest): Promise<void> {
    if (!this.notification) {
      if (!Number.isFinite(request.deadlineAt) || !Object.values(AddonShutdownReason).includes(request.reason)) {
        return Promise.reject(new RangeError('Invalid add-on shutdown request'));
      }
      this.notification = Promise.resolve().then(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('Add-on shutdown deadline exceeded')),
          Math.max(0, request.deadlineAt - Date.now()));

        try {
          await this.shutdownHook?.({ ...request, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      });
    }

    return this.notification;
  }

  shutdown(request: IAddonShutdownRequest): Promise<void> {
    if (!this.stopping) {
      if (!Number.isFinite(request.deadlineAt) || !Object.values(AddonShutdownReason).includes(request.reason)) {
        return Promise.reject(new RangeError('Invalid add-on shutdown request'));
      }
      this.stopping = Promise.resolve().then(() => this.finish(request));
    }

    return this.stopping;
  }

  close(): Promise<void> {
    return this.shutdown({ reason: AddonShutdownReason.HostShutdown, deadlineAt: Date.now() + 20000 });
  }

  private async finish(request: IAddonShutdownRequest): Promise<void> {
    const failures: unknown[] = [];

    try {
      await this.notify(request);
    } catch (error) {
      failures.push(error);
    }
    await Promise.all([...this.active]);

    try {
      await this.dispose?.();
    } catch (error) {
      failures.push(error);
    }

    if (failures.length) {
      throw new AggregateError(failures, 'Add-on shutdown failed');
    }
  }
}
