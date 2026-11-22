import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetHookHandler } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';

export class GetHookHandlerUseCase implements IGetHookHandler {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort) {}

  async execute(input: Parameters<IGetHookHandler['execute']>[0]): ReturnType<IGetHookHandler['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const handler = await this.store.handler(input.siteId, input.handlerId);

    if (handler?.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Handler not found');
    }

    return handler;
  }
}
