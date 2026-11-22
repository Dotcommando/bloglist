import { hookRequirement, validateHookObject } from '../../../domain/hooks/hook.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IProcessHookDeliveries } from '../../../ports/inbound/hooks/hook-execution.port.js';
import type { IHookCommandExecutorPort, IHookDeliveryStorePort, IHookRuntimePort } from
  '../../../ports/outbound/hooks/hook-execution.port.js';

export class ProcessHookDeliveriesUseCase implements IProcessHookDeliveries {
  constructor(private readonly store: IHookDeliveryStorePort, private readonly runtime: IHookRuntimePort,
    private readonly commands: IHookCommandExecutorPort) {}

  async execute(input: Parameters<IProcessHookDeliveries['execute']>[0]):
  ReturnType<IProcessHookDeliveries['execute']> {
    hookRequirement(Number.isSafeInteger(input.maximum) && input.maximum >= 1 && input.maximum <= 200,
      'Invalid work batch');
    const dispatched = await this.store.dispatch(input.maximum);
    let processed = 0;

    for (; processed < input.maximum; processed++) {
      const delivery = await this.store.claim();

      if (!delivery) {
        break;
      }

      let uncertain = false;

      try {
        let plan = delivery.plan;

        if (!plan) {
          const evaluated = await this.runtime.evaluate(delivery.recipient, {
            siteId: delivery.siteId,
            hookKey: delivery.hookKey,
            actorId: delivery.actorId,
            input: delivery.input,
            configuration: delivery.recipient.configuration,
            capabilities: delivery.recipient.capabilities,
          });

          hookRequirement(Array.isArray(evaluated.commands) && evaluated.commands.length <= 32, 'Invalid command plan');
          const keys = new Set<string>();

          for (const command of evaluated.commands) {
            hookRequirement(typeof command.key === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(command.key)
              && !keys.has(command.key) && delivery.recipient.capabilities.includes(command.name),
            'Command not permitted');
            validateHookObject(command.arguments, 65536);
            keys.add(command.key);
          }
          plan = await this.store.preparePlan(delivery, evaluated.commands);
        }

        for (const command of plan) {
          if (await this.store.commandSucceeded(delivery, command)) {
            continue;
          }
          await this.store.beginCommand(delivery, command);
          uncertain = true;
          const outcome = await this.commands.execute(delivery, command, delivery.deliveryId + ':' + command.key);

          await this.store.finishCommand(delivery, command, outcome);
          uncertain = !outcome.confirmed && !outcome.retrySafe && !outcome.rejected;

          if (!outcome.confirmed) {
            throw new BusinessError(outcome.rejected ? BusinessErrorCode.Validation
              : BusinessErrorCode.HookOutcomeUnknown,
            outcome.rejected ? 'Command rejected without effects' : 'Command outcome requires reconciliation');
          }
          uncertain = false;
        }
        await this.store.complete(delivery);
      } catch (error) {
        uncertain ||= error instanceof BusinessError && error.code === BusinessErrorCode.HookOutcomeUnknown;
        await this.store.fail(delivery, error instanceof BusinessError ? error.message
          : 'Hook execution failed', uncertain);
      }
    }

    return { dispatched, processed };
  }
}
