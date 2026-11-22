import { validateHookDraft, validateHookTitle } from '../../../domain/hooks/hook.js';
import type { IUpdateHookHandler } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore, IHookValuesPort } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';
import { checkedHookHandler } from '../../services/hooks/hook-handler-state.service.js';

export class UpdateHookHandlerUseCase implements IUpdateHookHandler {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort,
    private readonly values: IHookValuesPort) {}

  async execute(input: Parameters<IUpdateHookHandler['execute']>[0]): ReturnType<IUpdateHookHandler['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const current = await checkedHookHandler(this.store, input.siteId, input.handlerId, input.expectedVersion);

    validateHookTitle(input.title);
    validateHookDraft(input.draft, current.kind);
    const next = {
      ...current,
      title: input.title.trim(),
      draft: structuredClone(input.draft),
      version: this.values.id(),
      updatedAt: this.values.now(),
      updatedBy: input.actorId,
    };

    await this.store.saveHandler(next, current.version);

    return next;
  }
}
