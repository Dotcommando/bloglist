import type { TemplateValue } from '../pages/page-rendering.js';
import { type IParameterContract, ParameterKind } from '../publication/render-plan.js';
import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

function invalid(): never {
  throw new BusinessError(BusinessErrorCode.Validation, 'Invalid parameter contract');
}

function object(value: unknown): Record<string, unknown> {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }

  return Object.fromEntries(Object.entries(value));
}

function defaultValue(value: unknown, depth = 0): TemplateValue {
  if (depth > 16) {
    invalid();
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
    && Number.isFinite(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => defaultValue(entry, depth + 1));
  }

  const fields = object(value);

  return Object.fromEntries(Object.entries(fields).map(([key, entry]) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) {
      invalid();
    }

    return [key, defaultValue(entry, depth + 1)];
  }));
}

export function parseElementParameters(value: unknown): readonly IParameterContract[] {
  let count = 0;
  const parse = (value: unknown, depth: number): readonly IParameterContract[] => {
    if (!Array.isArray(value) || depth > 16) {
      invalid();
    }

    return value.map((entry: unknown): IParameterContract => {
      if (++count > 256) {
        invalid();
      }

      const item = object(entry);

      if (
        Object.keys(item).some((key) => !['name', 'kind', 'required', 'defaultValue', 'nullable',
          'properties', 'items', 'values'].includes(key))
      ) {
        invalid();
      }

      const kind = Object.values(ParameterKind).find((kind) => kind === item.kind);
      const values = item.values;

      if (
        typeof item.name !== 'string'
        || typeof item.required !== 'boolean'
        || !kind
        || item.nullable !== undefined
        && typeof item.nullable !== 'boolean'
        || values !== undefined
        && (!Array.isArray(values)
          || !values.every((entry: unknown) => typeof entry === 'string'))
      ) {
        invalid();
      }

      return {
        name: item.name,
        kind,
        required: item.required,
        ...(item.nullable === undefined ? {} : { nullable: item.nullable }),
        ...(Object.hasOwn(item, 'defaultValue') ? { defaultValue: defaultValue(item.defaultValue) } : {}),
        ...(item.properties === undefined ? {} : { properties: parse(item.properties, depth + 1) }),
        ...(item.items === undefined ? {} : { items: parse([item.items], depth + 1)[0]! }),
        ...(Array.isArray(values) ? { values: values.filter((item): item is string => typeof item === 'string') } : {}),
      };
    });
  };

  return parse(value, 0);
}
