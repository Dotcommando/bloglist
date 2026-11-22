import { validateHookDraft } from '../../../domain/hooks/hook.js';
import type { IApplyHookHandler } from '../../../ports/inbound/hooks/hook-configuration.port.js';
import type { IHookAccessPort, IHookCompilerPort, IHookConfigurationStore, IHookValuesPort } from
  '../../../ports/outbound/hooks/hook-configuration.port.js';
import { checkedHookHandler } from '../../services/hooks/hook-handler-state.service.js';

export class ApplyHookHandlerUseCase implements IApplyHookHandler {
  constructor(private readonly store: IHookConfigurationStore, private readonly access: IHookAccessPort,
    private readonly values: IHookValuesPort, private readonly compiler: IHookCompilerPort) {}

  async execute(input: Parameters<IApplyHookHandler['execute']>[0]): ReturnType<IApplyHookHandler['execute']> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const handler = await checkedHookHandler(this.store, input.siteId, input.handlerId, input.expectedVersion);

    validateHookDraft(handler.draft, handler.kind);
    const artifact = await this.compiler.compile(handler.draft.source);
    const version = {
      versionId: this.values.id(),
      siteId: input.siteId,
      handlerId: handler.handlerId,
      sourceDraftVersion: handler.version,
      source: handler.draft.source,
      ...artifact,
      kind: handler.kind,
      capabilities: [...handler.draft.capabilities],
      appliedAt: this.values.now(),
      appliedBy: input.actorId,
    };

    await this.store.apply({
      ...handler,
      activeVersionId: version.versionId,
      version: this.values.id(),
      updatedAt: version.appliedAt,
      updatedBy: input.actorId,
    }, version, handler.version);

    return version;
  }
}
