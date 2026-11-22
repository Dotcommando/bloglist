import type { IAddonObject } from '@zarya/addon-contracts/addons';
import type { HookDeliveryState, HookKind, IHookCommand } from '@zarya/addon-contracts/hooks';

export interface IHookRecipient {
  readonly subscriptionId: string;
  readonly consumerId: string;
  readonly hookKey: string;
  readonly kind: HookKind;
  readonly priority: number;
  readonly versionId: string;
  readonly addonKey: string | null;
  readonly configuration: IAddonObject;
  readonly capabilities: readonly string[];
  readonly retrySafe: boolean;
  readonly deliveryMode: 'Event' | 'Detail';
}

export interface IHookFact {
  readonly hookKey: string;
  readonly payload: IAddonObject;
  readonly details?: readonly IAddonObject[];
}

export interface IHookChange {
  readonly siteId: string | null;
  readonly actorId: string;
  readonly subject: string;
  readonly checkKey: string;
  readonly candidate: IAddonObject;
  readonly facts: readonly IHookFact[];
  readonly operationId?: string;
  readonly chainId?: string;
  readonly causalDepth?: number;
}

export interface IHookSnapshot {
  readonly installationId: string;
  readonly scopeKey: string;
  readonly siteId: string | null;
  readonly generation: string;
  readonly registryVersion: string;
  readonly recipients: readonly IHookRecipient[];
}

export interface IHookCommitIntent extends IHookSnapshot {
  readonly commandReceipt?: { readonly deliveryId: string;
    readonly commandKey: string;
    readonly ownerToken:
    string;
    readonly commandName: string };
  readonly operationId: string;
  readonly actorId: string;
  readonly subject: string;
  readonly facts: readonly IHookFact[];
  readonly occurredAt: Date;
  readonly chainId: string;
  readonly causalDepth: number;
}

export interface IHookDelivery {
  readonly deliveryId: string;
  readonly siteId: string | null;
  readonly generation: string;
  readonly eventId: string;
  readonly hookKey: string;
  readonly actorId: string;
  readonly chainId: string;
  readonly causalDepth: number;
  readonly recipient: IHookRecipient;
  readonly input: IAddonObject;
  readonly state: HookDeliveryState;
  readonly attemptCount: number;
  readonly ownerToken: string;
  readonly plan: readonly IHookCommand[] | null;
}

export interface IHookCommandOutcome {
  readonly rejected?: boolean;
  readonly confirmed: boolean;
  readonly retrySafe: boolean;
  readonly result: IAddonObject;
}
