import type { IAddonObject } from './addons.js';

export enum HookKind { Check = 'Check', Event = 'Event' }

export enum HookScopeKind { Site = 'Site', Installation = 'Installation' }

export enum HookDeliveryState {
  Pending = 'Pending', Running = 'Running', RetryScheduled = 'RetryScheduled', Paused = 'Paused',
  Succeeded = 'Succeeded', Failed = 'Failed', OutcomeUnknown = 'OutcomeUnknown', Skipped = 'Skipped',
  Superseded = 'Superseded',
}

export interface IHookDefinition {
  readonly hookKey: string;
  readonly title: string;
  readonly description: string;
  readonly provider: string;
  readonly kind: HookKind;
  readonly schemaVersion: number;
  readonly scopeKind: HookScopeKind;
}

export interface IHookCommand {
  readonly key: string;
  readonly name: string;
  readonly arguments: IAddonObject;
}

export interface IHookEvaluation {
  readonly allow?: boolean;
  readonly reason?: string;
  readonly commands?: readonly IHookCommand[];
}

export interface IHookInvocation {
  readonly siteId: string | null;
  readonly hookKey: string;
  readonly actorId: string;
  readonly input: IAddonObject;
  readonly configuration: IAddonObject;
  readonly capabilities: readonly string[];
}

export interface IAddonHookHandler {
  readonly key: string;
  readonly title: string;
  readonly hookKey: string;
  readonly kind: HookKind;
  readonly priority: number;
  readonly retrySafe: boolean;
  readonly source: string;
  readonly capabilities: readonly string[];
}

export interface IAddonHooksExtension {
  readonly version: 1;
  readonly definitions: readonly IHookDefinition[];
  readonly handlers: readonly IAddonHookHandler[];
}

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

export interface IHookSourcePort {
  prepare(change: IHookChange): Promise<IHookCommitIntent>;
}
