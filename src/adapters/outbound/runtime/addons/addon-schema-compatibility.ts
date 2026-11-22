import { isDeepStrictEqual } from 'node:util';

import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { packageObject } from './addon-package-manifest.js';

interface ISchemaIndex {
  readonly name: string;
  readonly key: Readonly<Record<string, unknown>>;
  readonly unique?: boolean;
}

interface IOwnedSchema {
  readonly validator: unknown;
  readonly indexes: readonly ISchemaIndex[];
}

/** Conservative structural check; the publisher also guarantees old/new code and data compatibility. */
export function assertCompatibleAddonSchema(previous: IOwnedSchema, next: IOwnedSchema): void {
  const oldValidator = packageObject(previous.validator);
  const newValidator = packageObject(next.validator);
  const oldShape = packageObject(oldValidator.$jsonSchema);
  const newShape = packageObject(newValidator.$jsonSchema);
  const oldProperties = packageObject(oldShape.properties);
  const newProperties = packageObject(newShape.properties);
  const oldRequired = oldShape.required;
  const newRequired = newShape.required;
  const rest = (value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !['properties', 'required'].includes(key)));

  if (
    !Array.isArray(oldRequired)
    || !Array.isArray(newRequired)
    || newRequired.some(value => !oldRequired.includes(value))
    || !isDeepStrictEqual(rest(oldShape), rest(newShape))
    || !isDeepStrictEqual(Object.keys(oldValidator), ['$jsonSchema'])
    || !isDeepStrictEqual(Object.keys(newValidator), ['$jsonSchema'])
    || Object.entries(oldProperties).some(([key, value]) => !isDeepStrictEqual(value, newProperties[key]))
    || previous.indexes.some(index => !next.indexes.some(candidate => candidate.name === index.name
      && isDeepStrictEqual(candidate.key, index.key) && !!candidate.unique === !!index.unique))
    || next.indexes.some(index => index.unique && !previous.indexes.some(candidate => candidate.name === index.name))
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Schema requires an exclusive add-on update');
  }
}
