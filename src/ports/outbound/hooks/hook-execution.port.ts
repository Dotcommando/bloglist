import type { IAddonObject } from '@zarya/addon-contracts/addons';

import type { IHookEvaluation, IHookInvocation } from '../../../domain/hooks/hook.js';
import type { IHookCommand } from '../../../domain/hooks/hook.js';
import type {
  IHookChange, IHookCommandOutcome, IHookCommitIntent, IHookDelivery, IHookRecipient,
  IHookSnapshot,
} from '../../../domain/hooks/hook-execution.js';

export interface IHookRuntimePort {
  evaluate(recipient: IHookRecipient, invocation: IHookInvocation): Promise<IHookEvaluation>;
}

export interface IHookEventStorePort {
  capture(siteId: string | null, hookKeys: readonly string[], candidate: IAddonObject): Promise<IHookSnapshot>;
  recordCheck(snapshot: IHookSnapshot, recipient: IHookRecipient, operationId: string, result: IHookEvaluation | null,
    error: string | null): Promise<void>;
}

export interface IHookDeliveryStorePort {
  dispatch(maximum: number): Promise<number>;
  claim(): Promise<IHookDelivery | null>;
  preparePlan(delivery: IHookDelivery, commands: readonly IHookCommand[]): Promise<readonly IHookCommand[]>;
  commandSucceeded(delivery: IHookDelivery, command: IHookCommand): Promise<boolean>;
  beginCommand(delivery: IHookDelivery, command: IHookCommand): Promise<void>;
  finishCommand(delivery: IHookDelivery, command: IHookCommand, outcome: IHookCommandOutcome): Promise<void>;
  complete(delivery: IHookDelivery): Promise<void>;
  fail(delivery: IHookDelivery, error: string, unknown: boolean): Promise<void>;
  history(siteId: string): Promise<readonly IAddonObject[]>;
  retry(siteId: string, deliveryId: string, version: string): Promise<void>;
  skip(siteId: string, deliveryId: string, version: string, reason: string): Promise<void>;
}

export interface IHookCommandExecutorPort {
  execute(delivery: IHookDelivery, command: IHookCommand, idempotencyKey: string): Promise<IHookCommandOutcome>;
}

export interface IHookChangesPort {
  prepare(change: IHookChange): Promise<IHookCommitIntent>;
}
