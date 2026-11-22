import type { ITemplateObject, TemplateValue } from '../../../../domain/pages/page-rendering.js';
import { type IParameterContract, ParameterKind } from '../../../../domain/publication/render-plan.js';
import { requireCondition } from '../../../../domain/shared/validation.js';

export function isTemplateObject(value: unknown): value is ITemplateObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateParameters(schema: readonly IParameterContract[], input: ITemplateObject): ITemplateObject {
  requireCondition(new Set(schema.map((item) => item.name)).size === schema.length, 'Duplicate parameter contract');
  const result: Record<string, TemplateValue> = {};

  for (const key of Object.keys(input)) {
    requireCondition(schema.some((field) => field.name === key), `Unknown parameter: ${key}`);
  }

  for (const field of schema) {
    requireCondition(/^[A-Za-z][A-Za-z0-9_]*$/.test(field.name)
      && !['__proto__', 'prototype', 'constructor'].includes(field.name), 'Unsafe parameter name');
    const value = Object.hasOwn(input, field.name) ? input[field.name] : field.defaultValue;

    if (value === undefined) {
      requireCondition(!field.required, `Missing parameter: ${field.name}`);
      continue;
    }
    result[field.name] = validateValue(field, value);
  }

  return result;
}

export function validateValue(field: IParameterContract, value: TemplateValue): TemplateValue {
  if (value === null && field.nullable) {
    return null;
  }

  switch (field.kind) {
    case ParameterKind.String:
      requireCondition(typeof value === 'string', `Expected string: ${field.name}`);
      break;
    case ParameterKind.Number:
      requireCondition(typeof value === 'number' && Number.isFinite(value), `Expected number: ${field.name}`);
      break;
    case ParameterKind.Boolean:
      requireCondition(typeof value === 'boolean', `Expected boolean: ${field.name}`);
      break;
    case ParameterKind.Enum:
      requireCondition(typeof value === 'string' && Boolean(field.values?.includes(value)),
        `Invalid enum: ${field.name}`);
      break;
    case ParameterKind.Object:
      requireCondition(isTemplateObject(value), `Expected object: ${field.name}`);

      if (isTemplateObject(value)) {
        return validateParameters(field.properties ?? [], value);
      }
      break;
    case ParameterKind.Array:
      requireCondition(Array.isArray(value) && field.items !== undefined, `Expected typed array: ${field.name}`);

      if (Array.isArray(value) && field.items) {
        return value.map((entry) => validateValue(field.items!, entry));
      }
      break;
    default: throw new Error('Unsupported parameter kind');
  }

  return structuredClone(value);
}
