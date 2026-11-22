import { type IParameterContract, ParameterKind } from '../../../../domain/publication/render-plan.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { isTemplateObject } from './parameters.js';

export function contracts(value: unknown): readonly IParameterContract[] {
  requireCondition(Array.isArray(value), 'Parameter contract must be an array');

  if (!Array.isArray(value)) {
    throw new Error('Invalid parameter contract');
  }

  return value.map((item: unknown): IParameterContract => {
    requireCondition(isTemplateObject(item), 'Invalid parameter contract entry');

    if (!isTemplateObject(item) || typeof item.name !== 'string' || typeof item.required !== 'boolean') {
      throw new Error('Parameter name and required flag must be explicit');
    }

    const kind = Object.values(ParameterKind).find((kind) => kind === item.kind);

    requireCondition(kind !== undefined, 'Unknown parameter kind');

    if (!kind) {
      throw new Error('Unknown parameter kind');
    }

    const values = item.values;

    requireCondition(values === undefined || (Array.isArray(values) && values.every((v) => typeof v === 'string')),
      'Enum values must be strings');

    return {
      name: item.name,
      kind,
      required: item.required,
      ...(item.defaultValue === undefined ? {} : { defaultValue: item.defaultValue }),
      ...(item.nullable === undefined ? {} : { nullable: item.nullable === true }),
      ...(item.properties === undefined ? {} : { properties: contracts(item.properties) }),
      ...(item.items === undefined ? {} : { items: contracts([item.items])[0]! }),
      ...(Array.isArray(values) ? { values: values.filter((v): v is string => typeof v === 'string') } : {}),
    };
  });
}

