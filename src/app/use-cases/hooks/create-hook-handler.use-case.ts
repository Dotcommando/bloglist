import { HookKind, validateHookDraft, validateHookTitle } from '../../../domain/hooks/hook.js';
import { hookRequirement } from '../../../domain/hooks/hook.js';
import type { ICreateHookHandler } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookConfigurationStore, IHookValuesPort } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';

export class CreateHookHandlerUseCase implements ICreateHookHandler {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort,
    private readonly values: IHookValuesPort) {}

  async execute(input: Parameters<ICreateHookHandler['execute']>[0]): ReturnType<ICreateHookHandler['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    validateHookTitle(input.title);
    hookRequirement(Object.values(HookKind).includes(input.kind), 'Invalid hook kind');
    validateHookDraft(input.draft, input.kind);
    const at = this.values.now();
    const handler = {
      handlerId: this.values.id(),
      siteId: input.siteId,
      title: input.title.trim(),
      kind: input.kind,
      draft: structuredClone(input.draft),
      activeVersionId: null,
      enabled: false,
      version: this.values.id(),
      createdAt: at,
      updatedAt: at,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    };

    await this.store.saveHandler(handler, null);

    return handler;
  }
}
