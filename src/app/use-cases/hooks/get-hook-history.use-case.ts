import type { IGetHookHistory } from '../../../ports/inbound/hooks/hook-execution.port.js';
import type { IHookAccessPort } from '../../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookDeliveryStorePort } from '../../../ports/outbound/hooks/hook-execution.port.js';

export class GetHookHistoryUseCase implements IGetHookHistory {
  constructor(private readonly store: IHookDeliveryStorePort, private readonly access: IHookAccessPort) {}

  async execute(input: Parameters<IGetHookHistory['execute']>[0]): ReturnType<IGetHookHistory['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);

    return this.store.history(input.siteId);
  }
}
