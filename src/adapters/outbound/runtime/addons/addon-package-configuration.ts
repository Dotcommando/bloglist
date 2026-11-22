import type { AddonValue, IAddonConfiguration, IAddonObject } from '@zarya/addon-contracts/addons';

import { packageObject } from './addon-package-manifest.js';

function object(value: unknown, depth = 0): value is IAddonObject {
  return depth <= 16 && value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, child]) => !['__proto__', 'constructor', 'prototype'].includes(key)
      && json(child, depth + 1));
}

function json(value: unknown, depth: number): value is AddonValue {
  return depth <= 16 && (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)
    || Array.isArray(value) && value.every((child: unknown) => json(child, depth + 1)) || object(value, depth));
}

export function packageConfiguration(value: unknown): IAddonConfiguration {
  const item = packageObject(value);

  if (
    typeof item.schemaVersion !== 'number'
    || !Number.isSafeInteger(item.schemaVersion)
    || item.schemaVersion < 1
    || !object(item.values)
  ) {
    throw new Error('Invalid package configuration');
  }

  return { schemaVersion: item.schemaVersion, values: item.values };
}
