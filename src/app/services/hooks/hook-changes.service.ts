import type { IHookCommand } from '../../../domain/hooks/hook.js';
import { HookKind, hookRequirement, validateHookObject } from '../../../domain/hooks/hook.js';
import type { IHookChange, IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IHookDelivery } from '../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IHookValuesPort } from '../../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookChangesPort, IHookEventStorePort, IHookRuntimePort } from
  '../../../ports/outbound/hooks/hook-execution.port.js';

export class HookChangesService implements IHookChangesPort {
  constructor(private readonly store: IHookEventStorePort, private readonly runtime: IHookRuntimePort,
    private readonly values: IHookValuesPort) {}

  forCommand(delivery: IHookDelivery, command: IHookCommand): IHookChangesPort {
    return {
      prepare: async (change) => {
        const intent = await this.prepare({
          ...change,
          actorId: 'hook:' + delivery.recipient.consumerId,
          operationId: delivery.deliveryId + ':' + command.key,
          chainId: delivery.chainId,
          causalDepth: delivery.causalDepth + 1,
        });

        if (intent.siteId !== delivery.siteId || intent.generation !== delivery.generation) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Hook generation changed');
        }

        return {
          ...intent,
          commandReceipt: {
            deliveryId: delivery.deliveryId,
            commandKey: command.key,
            ownerToken: delivery.ownerToken,
            commandName: command.name,
          },
        };
      },
    };
  }

  async prepare(change: IHookChange): Promise<IHookCommitIntent> {
    validateHookObject(change.candidate, 65536);
    hookRequirement((change.causalDepth ?? 0) <= 16, 'Hook causal depth exceeded');

    for (const fact of change.facts) {
      validateHookObject(fact.payload, 65536);
      fact.details?.forEach((detail) => validateHookObject(detail, 65536));
    }
    const snapshot = await this.store.capture(change.siteId,
      [change.checkKey, ...change.facts.map((fact) => fact.hookKey)], change.candidate);
    const operationId = change.operationId ?? this.values.id();
    const startedAt = this.values.now().getTime();
    const checks = snapshot.recipients.filter((item) => item.kind === HookKind.Check && item.hookKey
      === change.checkKey)
      .sort((a, b) => a.priority - b.priority || a.subscriptionId.localeCompare(b.subscriptionId));

    for (const recipient of checks) {
      if (this.values.now().getTime() - startedAt > 5000) {
        throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Extension check budget exceeded');
      }

      let result;

      try {
        result = await this.runtime.evaluate(recipient, {
          siteId: change.siteId,
          hookKey: change.checkKey,
          actorId: change.actorId,
          input: change.candidate,
          configuration: recipient.configuration,
          capabilities: recipient.capabilities,
        });
        hookRequirement(typeof result.allow === 'boolean' && result.commands === undefined, 'Invalid check result');
      } catch {
        await this.store.recordCheck(snapshot, recipient, operationId, null, 'Check execution unavailable');
        throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Required hook check is unavailable');
      }
      await this.store.recordCheck(snapshot, recipient, operationId, result, null);

      if (this.values.now().getTime() - startedAt > 5000) {
        throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Extension check budget exceeded');
      }
      if (!result.allow) {
        throw new BusinessError(BusinessErrorCode.HookDenied, result.reason?.slice(0, 500)
          || 'Action denied by a hook');
      }
    }

    return {
      ...snapshot,
      operationId,
      actorId: change.actorId,
      subject: change.subject,
      facts: structuredClone(change.facts),
      occurredAt: this.values.now(),
      chainId: change.chainId ?? operationId,
      causalDepth: change.causalDepth ?? 0,
    };
  }
}
