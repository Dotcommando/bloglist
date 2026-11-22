import {
  type IAddonConfiguration, type IAddonDefinition, SiteAddonStatus,
} from '@zarya/addon-contracts/addons';

import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export {
  type IAddonConfiguration, type IAddonDefinition, SiteAddonStatus,
} from '@zarya/addon-contracts/addons';

export interface ISiteAddonState {
  readonly siteAddonId: string;
  readonly siteId: string;
  readonly addonKey: string;
  readonly status: SiteAddonStatus;
  readonly configuration: IAddonConfiguration;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface ISiteAddonView {
  readonly addonKey: string;
  readonly definition: IAddonDefinition | null;
  readonly connection: ISiteAddonState | null;
}

export function requireAddonKey(value: string): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on key');
  }
}

export class SiteAddon {
  private readonly state: ISiteAddonState;

  constructor(state: ISiteAddonState) {
    requireAddonKey(state.addonKey);

    if (
      [state.siteAddonId, state.siteId, state.version, state.createdBy, state.updatedBy]
        .some((value) => !value.trim())
      || !Object.values(SiteAddonStatus).includes(state.status)
      || !Number.isFinite(state.createdAt.getTime())
      || !Number.isFinite(state.updatedAt.getTime())
      || state.updatedAt < state.createdAt
      || !Number.isSafeInteger(state.configuration.schemaVersion)
      || state.configuration.schemaVersion < 1
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on connection');
    }

    let nodes = 0;
    const inspect = (value: unknown, depth: number): void => {
      nodes++;

      if (nodes > 1024 || depth > 16 || typeof value === 'number' && !Number.isFinite(value)) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid configuration complexity');
      }
      if (value !== null && typeof value === 'object') {
        if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Expected JSON configuration');
        }

        for (const [key, child] of Object.entries(value)) {
          if (['__proto__', 'constructor', 'prototype'].includes(key)) {
            throw new BusinessError(BusinessErrorCode.Validation, 'Invalid configuration field');
          }
          inspect(child, depth + 1);
        }
      } else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Expected JSON configuration');
      }
    };

    inspect(state.configuration.values, 0);
    this.state = structuredClone(state);
  }

  toState(): ISiteAddonState {
    return structuredClone(this.state);
  }
}
