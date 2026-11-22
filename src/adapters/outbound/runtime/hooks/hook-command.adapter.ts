import type { IHookCommand } from '../../../../domain/hooks/hook.js';
import type { IHookCommandOutcome, IHookDelivery } from '../../../../domain/hooks/hook-execution.js';
import type { IHookCommandExecutorPort } from '../../../../ports/outbound/hooks/hook-execution.port.js';

export type HookCommandOperation = (delivery: IHookDelivery, command: IHookCommand, idempotencyKey: string) =>
Promise<IHookCommandOutcome>;

export class HookCommandAdapter implements IHookCommandExecutorPort {
  constructor(private readonly operations: ReadonlyMap<string, HookCommandOperation>) {}

  async execute(delivery: IHookDelivery, command: IHookCommand, idempotencyKey: string): Promise<IHookCommandOutcome> {
    const operation = this.operations.get(command.name);

    if (
      !operation
      || !delivery.recipient.capabilities.includes(command.name)
      || ['siteId', 'actorId', 'installationId'].some((key) => Object.hasOwn(command.arguments, key))
    ) {
      return { confirmed: false, retrySafe: false, rejected: true, result: { error: 'CommandNotPermitted' } };
    }

    return operation(delivery, command, idempotencyKey);
  }
}
