import type { IRetryHookDelivery } from '../../../ports/inbound/hooks/hook-execution.port.js';
import type { IHookAccessPort } from '../../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookDeliveryStorePort } from '../../../ports/outbound/hooks/hook-execution.port.js';

export class RetryHookDeliveryUseCase implements IRetryHookDelivery {
  constructor(private readonly store: IHookDeliveryStorePort, private readonly access: IHookAccessPort) {}

  async execute(input: Parameters<IRetryHookDelivery['execute']>[0]): ReturnType<IRetryHookDelivery['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    await this.store.retry(input.siteId, input.deliveryId, input.version);
  }
}
