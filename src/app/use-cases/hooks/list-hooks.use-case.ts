import type { IListHooks } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';

export class ListHooksUseCase implements IListHooks {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort) {}

  async execute(input: Parameters<IListHooks['execute']>[0]): ReturnType<IListHooks['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);

    return this.store.tree(input.siteId);
  }
}
