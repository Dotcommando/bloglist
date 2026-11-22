import { hookRequirement } from '../../../domain/hooks/hook.js';
import type { ISetHookHandlerEnabled } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore, IHookValuesPort } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';
import { checkedHookHandler } from '../../services/hooks/hook-handler-state.service.js';

export class SetHookHandlerEnabledUseCase implements ISetHookHandlerEnabled {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort,
    private readonly values: IHookValuesPort) {}

  async execute(input: Parameters<ISetHookHandlerEnabled['execute']>[0]):
  ReturnType<ISetHookHandlerEnabled['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const handler = await checkedHookHandler(this.store, input.siteId, input.handlerId, input.expectedVersion);

    hookRequirement(typeof input.enabled === 'boolean' && (!input.enabled || handler.activeVersionId !== null),
      'Apply handler code before enabling');

    if (handler.enabled === input.enabled) {
      await this.store.saveHandler(handler, handler.version);

      return handler;
    }

    const next = {
      ...handler,
      enabled: input.enabled,
      version: this.values.id(),
      updatedAt: this.values.now(),
      updatedBy: input.actorId,
    };

    await this.store.saveHandler(next, handler.version);

    return next;
  }
}
