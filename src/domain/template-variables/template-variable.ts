import type { ITemplateObject, TemplateValue } from '../pages/page-rendering.js';
import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export enum TemplateVariableKind { Text = 'Text', Markdown = 'Markdown', Image = 'Image', File = 'File' }

export enum ImageBindingMode { Single = 'Single', Responsive = 'Responsive' }

export interface ITemplateVariable {
  readonly name: string;
  readonly caption: string;
  readonly description: string;
  readonly kind: TemplateVariableKind;
  readonly templateIds: readonly string[];
  readonly required: boolean;
  readonly sortOrder: number;
  readonly defaultValue?: TemplateValue;
}

export interface ITemplateVariableCatalog {
  readonly siteId: string;
  readonly version: string;
  readonly fields: readonly ITemplateVariable[];
}

export function tvRequirement(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new BusinessError(BusinessErrorCode.Validation, message);
  }
}

export function tvObject(value: unknown): value is ITemplateObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateTemplateValue(value: unknown): asserts value is TemplateValue {
  if (value === null || typeof value === 'string') {
    return;
  }
  tvRequirement(tvObject(value), 'Invalid TV value');
  const allowed = value.kind === TemplateVariableKind.Markdown ? ['kind', 'text']
    : value.kind === TemplateVariableKind.Image ? ['kind', 'fileId', 'mode', 'key', 'alt']
      : ['kind', 'fileId', 'label'];

  tvRequirement(Object.keys(value).every((key) => allowed.includes(key)), 'Unknown TV value fields');

  if (value.kind === TemplateVariableKind.Markdown) {
    tvRequirement(typeof value.text === 'string', 'Markdown TV requires text');
  } else {
    tvRequirement([TemplateVariableKind.Image, TemplateVariableKind.File].some((kind) => kind === value.kind)
      && typeof value.fileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.fileId), 'Invalid TV file');

    if (value.kind === TemplateVariableKind.Image) {
      tvRequirement((value.mode === ImageBindingMode.Single || value.mode === ImageBindingMode.Responsive)
        && typeof value.alt === 'string'
        && (value.mode === ImageBindingMode.Responsive ? value.key === undefined
          : typeof value.key === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.key)), 'Invalid image binding');
    } else {
      tvRequirement(typeof value.label === 'string', 'File TV requires a link caption');
    }
  }
}

export function validateTemplateValues(values: unknown): asserts values is ITemplateObject {
  tvRequirement(tvObject(values) && Object.keys(values).length <= 256, 'Invalid TV values');

  for (const [name, value] of Object.entries(values)) {
    tvRequirement(/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name)
      && !['constructor', 'prototype'].includes(name), 'Invalid TV name');
    validateTemplateValue(value);
  }
}

export function validateFieldValue(field: ITemplateVariable, value: TemplateValue): void {
  validateTemplateValue(value);
  tvRequirement(value === null || (field.kind === TemplateVariableKind.Text ? typeof value === 'string'
    : tvObject(value) && value.kind === field.kind), 'TV value does not match its type: ' + field.name);
}

function isField(value: unknown): value is ITemplateVariable {
  return tvObject(value) && typeof value.name === 'string' && typeof value.caption === 'string'
    && typeof value.description === 'string' && Object.values(TemplateVariableKind).some((kind) => kind === value.kind)
    && typeof value.required === 'boolean' && typeof value.sortOrder === 'number' && Array.isArray(value.templateIds)
    && value.templateIds.every((id: unknown) => typeof id === 'string');
}

export function validateTemplateVariables(fields: unknown): asserts fields is readonly ITemplateVariable[] {
  tvRequirement(Array.isArray(fields) && fields.length <= 256, 'Invalid TV definitions');
  const names = new Set<string>();
  const reserved = ['id', 'title', 'h1', 'metaTitle', 'metaDescription', 'robotsIndex', 'ogTitle', 'ogDescription',
    'ogImage', 'ogType', 'seo', 'contentMd', 'language', 'pageId', 'page', 'site', 'request', 'tv',
    'constructor', 'prototype'];

  for (const field of fields) {
    tvRequirement(isField(field), 'Invalid TV definition');
    tvRequirement(field !== null && typeof field === 'object' && Object.keys(field).every((key) => ['name',
      'caption', 'description', 'kind',
      'templateIds', 'required', 'sortOrder', 'defaultValue'].includes(key)), 'Unknown TV definition fields');
    tvRequirement(typeof field.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(field.name)
      && !names.has(field.name) && !reserved.includes(field.name), 'Duplicate or reserved TV name');
    names.add(field.name);
    tvRequirement(typeof field.caption === 'string' && field.caption.trim().length > 0 && field.caption.length <= 200
      && typeof field.description === 'string' && field.description.length <= 2000
      && Object.values(TemplateVariableKind).includes(field.kind) && typeof field.required === 'boolean'
      && Number.isSafeInteger(field.sortOrder) && Array.isArray(field.templateIds)
      && field.templateIds.length > 0 && new Set(field.templateIds).size === field.templateIds.length
      && field.templateIds.every((id: unknown) => typeof id === 'string' && id.length > 0), 'Invalid TV definition');

    if (Object.hasOwn(field, 'defaultValue')) {
      validateFieldValue(field, field.defaultValue!);
    }
  }
}

export function effectiveTemplateValues(fields: readonly ITemplateVariable[], templateId: string,
  values: ITemplateObject, publishing = false): ITemplateObject {
  const result: Record<string, TemplateValue> = { ...values };

  for (const field of fields.filter((field) => field.templateIds.includes(templateId))) {
    const value = Object.hasOwn(values, field.name) ? values[field.name] : field.defaultValue;

    if (publishing) {
      tvRequirement(!field.required || value != null && (typeof value === 'string' ? value.trim().length > 0
        : !tvObject(value) || value.kind !== TemplateVariableKind.Markdown || String(value.text).trim().length > 0),
      'Required TV is empty: ' + field.name);
    }
    if (value !== undefined || publishing) {
      result[field.name] = value ?? null;
    }
  }

  return result;
}
