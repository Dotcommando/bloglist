import { object, request, string } from '../../shared/api/content-api';
import {
  type ITvCatalog,
  type ITvDetails,
  type ITvField,
  parseTvValue,
  parseTvValues,
  TvKind,
  type TvValue,
} from './template-variables.types';

function catalog(value: unknown): ITvCatalog {
  const row = object(value);

  if (!Array.isArray(row.fields)) {
    throw new Error('Invalid TV catalog');
  }

  return {
    siteId: string(row.siteId),
    version: string(row.version),
    fields: row.fields.map((value: unknown): ITvField => {
      const field = object(value);
      const kind = Object.values(TvKind).find((kind) => kind === field.kind);

      if (
        !kind
        || !Array.isArray(field.templateIds)
        || typeof field.required !== 'boolean'
        || typeof field.sortOrder !== 'number'
      ) {
        throw new Error('Invalid TV field');
      }

      return {
        name: string(field.name),
        caption: string(field.caption),
        description: string(field.description),
        kind,
        templateIds: field.templateIds.map(string),
        required: field.required,
        sortOrder: field.sortOrder,
        ...(Object.hasOwn(field, 'defaultValue') ? { defaultValue: parseTvValue(field.defaultValue) } : {}),
      };
    }),
  };
}

export async function listTemplateVariables(siteId: string): Promise<ITvCatalog> {
  return catalog(await request('/' + encodeURIComponent(siteId) + '/template-variables'));
}

export async function saveTemplateVariables(catalogValue: ITvCatalog): Promise<ITvCatalog> {
  return catalog(await request('/' + encodeURIComponent(catalogValue.siteId) + '/template-variables', {
    fields: catalogValue.fields, expectedVersion: catalogValue.version,
  }));
}

export async function getPageTemplateVariables(siteId: string, pageId: string): Promise<ITvDetails> {
  const row = object(await request('/' + encodeURIComponent(siteId) + '/pages/' + encodeURIComponent(pageId)
    + '/template-variables'));

  return {
    catalog: catalog(row.catalog),
    values: parseTvValues(row.values),
    templateId: row.templateId === null ? null : string(row.templateId),
    updatedAt: string(row.updatedAt),
    mediaVersion: string(row.mediaVersion),
  };
}

export async function savePageTemplateVariables(siteId: string, pageId: string, templateId: string,
  values: Record<string, TvValue>, updatedAt: string, catalogVersion: string, mediaVersion: string): Promise<string> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/pages/' + encodeURIComponent(pageId)
    + '/template-variables', {
    templateId, values, expectedUpdatedAt: updatedAt, catalogVersion, mediaVersion,
  }));

  return string(result.updatedAt);
}
