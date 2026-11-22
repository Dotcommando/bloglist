import { hookRequirement } from '../../../domain/hooks/hook.js';
import type { ISkipHookDelivery } from '../../../ports/inbound/hooks/hook-execution.port.js';
import type { IHookAccessPort } from '../../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookDeliveryStorePort } from '../../../ports/outbound/hooks/hook-execution.port.js';

export class SkipHookDeliveryUseCase implements ISkipHookDelivery {
  constructor(private readonly store: IHookDeliveryStorePort, private readonly access: IHookAccessPort) {}

  async execute(input: Parameters<ISkipHookDelivery['execute']>[0]): ReturnType<ISkipHookDelivery['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    hookRequirement(typeof input.reason === 'string' && input.reason.trim().length > 0 && input.reason.length <= 500,
      'A skip reason is required');
    await this.store.skip(input.siteId, input.deliveryId, input.version, input.reason);
  }
}
