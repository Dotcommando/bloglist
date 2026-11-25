import type { IAddonDumpParts, ISiteDumpApplication, ISiteDumpCreation } from '../../../../domain/dumps/site-dump.js';
import { SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import { HttpFailure } from '../shared/admin-http.boundary.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpFailure(400, 'Expected object');
  }

  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) {
    throw new HttpFailure(400, 'Invalid selection');
  }

  return value;
}

function parts(value: unknown): IAddonDumpParts {
  const result = object(value);

  if (
    Object.keys(result).some((key) => !['configuration', 'businessData', 'package'].includes(key))
    || typeof result.configuration !== 'boolean'
    || typeof result.businessData !== 'boolean'
    || typeof result.package !== 'boolean'
  ) {
    throw new HttpFailure(400, 'Invalid add-on parts');
  }

  return { configuration: result.configuration, businessData: result.businessData, package: result.package };
}

export function parseDumpCreation(body: Record<string, unknown>): ISiteDumpCreation | undefined {
  if (!Object.keys(body).length) {
    return undefined;
  }

  const type = Object.values(SiteDumpType).find((type) =>
    type === body.type && ![SiteDumpType.Unknown, SiteDumpType.Installation].includes(type));

  if (
    !type
    || Object.keys(body).some((key) => !['type', 'itemIds', 'addonParts'].includes(key))
    || body.itemIds !== undefined
    && !Array.isArray(body.itemIds)
  ) {
    throw new HttpFailure(400, 'Invalid dump creation');
  }

  const ids: unknown[] | undefined = body.itemIds;

  return {
    type,
    ...(ids ? { itemIds: ids.map(text) } : {}),
    ...(body.addonParts === undefined ? {} : { addonParts: parts(body.addonParts) }),
  };
}

export function parseDumpApplication(body: Record<string, unknown>): ISiteDumpApplication | undefined {
  if (!Object.keys(body).length) {
    return undefined;
  }
  if (
    Object.keys(body).some((key) => ![
      'version', 'choices', 'pageMappings', 'addonParts', 'omitUnresolvedFiles',
    ].includes(key))
    || !Array.isArray(body.choices)
    || body.omitUnresolvedFiles !== undefined
    && typeof body.omitUnresolvedFiles !== 'boolean'
  ) {
    throw new HttpFailure(400, 'Invalid import selection');
  }

  const choices: unknown[] = body.choices;

  return {
    version: text(body.version),
    choices: choices.map((value) => {
      const row = object(value);

      if (Object.keys(row).some((key) => !['id', 'targetId'].includes(key))) {
        throw new HttpFailure(400, 'Invalid item');
      }

      return { id: text(row.id), targetId: row.targetId === null ? null : text(row.targetId) };
    }),
    ...(body.pageMappings === undefined ? {} : {
      pageMappings: Object.fromEntries(
        Object.entries(object(body.pageMappings)).map(([key, value]) => [key, text(value)]),
      ),
    }),
    ...(body.addonParts === undefined ? {} : { addonParts: parts(body.addonParts) }),
    ...(typeof body.omitUnresolvedFiles === 'boolean' ? { omitUnresolvedFiles: body.omitUnresolvedFiles } : {}),
  };
}
