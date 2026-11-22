import type { IAddonObject } from '@zarya/addon-contracts/addons';
import { HookDeliveryState, HookKind, HookScopeKind, type IHookDefinition } from '@zarya/addon-contracts/hooks';

import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export type { IHookCommand, IHookDefinition, IHookEvaluation, IHookInvocation } from '@zarya/addon-contracts/hooks';

export { HookDeliveryState, HookKind, HookScopeKind };

export interface IHookDraft {
  readonly source: string;
  readonly capabilities: readonly string[];
}

export interface IHookHandler {
  readonly handlerId: string;
  readonly siteId: string;
  readonly title: string;
  readonly kind: HookKind;
  readonly draft: IHookDraft;
  readonly activeVersionId: string | null;
  readonly enabled: boolean;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface IHookHandlerVersion {
  readonly versionId: string;
  readonly siteId: string;
  readonly handlerId: string;
  readonly sourceDraftVersion: string;
  readonly source: string;
  readonly compiledJavaScript: string;
  readonly digest: string;
  readonly kind: HookKind;
  readonly capabilities: readonly string[];
  readonly appliedAt: Date;
  readonly appliedBy: string;
}

export interface IHookSubscription {
  readonly subscriptionId: string;
  readonly siteId: string;
  readonly hookKey: string;
  readonly schemaVersion: number;
  readonly kind: HookKind;
  readonly title: string;
  readonly handlerId: string;
  readonly addonKey: string | null;
  readonly handlerKey: string | null;
  readonly ownerKind: 'User' | 'Addon';
  readonly configuration: IAddonObject;
  readonly filters: IAddonObject;
  readonly enabled: boolean;
  readonly priority: number;
  readonly retrySafe: boolean;
  readonly deliveryMode: 'Event' | 'Detail';
  readonly manifestKey: string | null;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface IRegisteredHook extends IHookDefinition {
  readonly registeredAt: Date;
  readonly available: boolean;
  readonly subscriptions: readonly IHookSubscription[];
}

export interface IHookTree {
  readonly hooks: readonly IRegisteredHook[];
  readonly handlers: readonly IHookHandler[];
}

export function hookRequirement(value: unknown, message: string): asserts value {
  if (!value) {
    throw new BusinessError(BusinessErrorCode.Validation, message);
  }
}

export function validateHookDraft(value: IHookDraft, kind: HookKind): void {
  hookRequirement(typeof value.source === 'string' && value.source.trim().length > 0
    && value.source.length <= 100000 && Array.isArray(value.capabilities)
    && value.capabilities.length <= 32 && value.capabilities.every((item) => typeof item === 'string'
      && /^[a-z][a-z0-9.-]{1,127}$/.test(item)) && new Set(value.capabilities).size === value.capabilities.length,
  'Invalid hook source or capabilities');
  hookRequirement(kind !== HookKind.Check || value.capabilities.every((key) => key.startsWith('query.')),
    'Checks cannot execute commands');
}

export function validateHookTitle(value: string): void {
  hookRequirement(typeof value === 'string' && value.trim().length > 0 && value.length <= 200
    && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value), 'Invalid handler title');
}

export function validateHookObject(value: unknown, maximum = 16384): asserts value is IAddonObject {
  let nodes = 0;
  const visit = (item: unknown, depth: number): boolean => {
    nodes++;

    return nodes <= 1024 && depth <= 16 && (item === null || typeof item === 'string'
      || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)
      || Array.isArray(item) && item.every((child: unknown) => visit(child, depth + 1))
      || typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype
      && Object.entries(item).every(([key, child]) => !['__proto__', 'prototype', 'constructor'].includes(key)
        && visit(child, depth + 1)));
  };

  hookRequirement(value !== null && typeof value === 'object' && !Array.isArray(value) && visit(value, 0)
    && new TextEncoder().encode(JSON.stringify(value)).length <= maximum, 'Invalid hook JSON');
}
