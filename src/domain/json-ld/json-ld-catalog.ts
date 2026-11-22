import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { JsonLdReferenceKind, type JsonLdValue, JsonLdValueKind } from './json-ld-graph.js';

export enum JsonLdSourceKind {
  Constant = 'constant',
  PageField = 'pageField',
  TemplateVariable = 'templateVariable',
  Snippet = 'snippet',
  SharedObject = 'sharedObject',
  CurrentPage = 'currentPage',
  CurrentNode = 'currentNode',
  PageEntity = 'pageEntity',
  Page = 'page',
  ExactUrl = 'exactUrl',
  ExternalUrl = 'externalUrl',
}

export type JsonLdSource =
  | {
    readonly kind: JsonLdSourceKind.Constant;
    readonly value: string | number | boolean | readonly (string | number | boolean)[];
  }
  | { readonly kind: JsonLdSourceKind.PageField; readonly name: string }
  | { readonly kind: JsonLdSourceKind.TemplateVariable; readonly name: string; readonly path?: readonly string[] }
  | { readonly kind: JsonLdSourceKind.Snippet; readonly name: string; readonly path?: readonly string[] }
  | { readonly kind: JsonLdSourceKind.SharedObject; readonly objectId: string }
  | { readonly kind: JsonLdSourceKind.CurrentPage }
  | { readonly kind: JsonLdSourceKind.CurrentNode; readonly role: string }
  | { readonly kind: JsonLdSourceKind.PageEntity; readonly pageId: string; readonly role: string }
  | { readonly kind: JsonLdSourceKind.Page; readonly pageId: string }
  | { readonly kind: JsonLdSourceKind.ExactUrl; readonly urlId: string; readonly pageId: string }
  | { readonly kind: JsonLdSourceKind.ExternalUrl; readonly url: string };

export type JsonLdValueSource = Extract<JsonLdSource, {
  readonly kind: JsonLdSourceKind.Constant | JsonLdSourceKind.PageField
    | JsonLdSourceKind.TemplateVariable | JsonLdSourceKind.Snippet;
}>;

export interface IJsonLdMapping {
  readonly property: string;
  readonly required: boolean;
  readonly source: JsonLdSource;
}

export interface IJsonLdProfileNode {
  readonly role: string;
  readonly type: string;
  readonly keySource?: JsonLdValueSource;
  readonly presenceSource?: JsonLdValueSource;
  readonly mappings: readonly IJsonLdMapping[];
}

export interface IJsonLdProfile {
  readonly profileId: string;
  readonly name: string;
  readonly templateIds: readonly string[];
  readonly nodes: readonly IJsonLdProfileNode[];
}

export interface IJsonLdSharedObject {
  readonly objectId: string;
  readonly name: string;
  readonly type: 'Organization' | 'Person';
  readonly properties: Readonly<Record<string, JsonLdValue>>;
}

export interface IJsonLdCatalog {
  readonly siteId: string;
  readonly version: string;
  readonly profiles: readonly IJsonLdProfile[];
  readonly objects: readonly IJsonLdSharedObject[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasCatalogStructure(value: unknown): value is IJsonLdCatalog {
  if (!isObject(value) || !Array.isArray(value.profiles) || !Array.isArray(value.objects)) {
    return false;
  }

  return value.profiles.every((profile: unknown) => isObject(profile) && Array.isArray(profile.templateIds)
    && Array.isArray(profile.nodes) && profile.nodes.every((node: unknown) => isObject(node)
      && Array.isArray(node.mappings) && node.mappings.every((mapping: unknown) => isObject(mapping)
        && isObject(mapping.source))))
    && value.objects.every((object: unknown) => isObject(object) && isObject(object.properties)
      && Object.values(object.properties).every((entry: unknown) => isObject(entry)
        && (entry.kind !== JsonLdValueKind.Url || isObject(entry.reference))));
}

export function validateJsonLdCatalog(value: unknown): asserts value is IJsonLdCatalog {
  if (!hasCatalogStructure(value)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid JSON-LD catalog');
  }

  const catalog = value;
  const requireValid = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new BusinessError(BusinessErrorCode.Validation, message);
    }
  };
  const keys = (value: unknown, allowed: readonly string[]): boolean => value !== null && typeof value === 'object'
    && Object.keys(value).every((key) => allowed.includes(key));
  const identifier = (value: unknown): boolean => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const label = (value: unknown): boolean => typeof value === 'string'
    && value.trim().length > 0 && value.length <= 200;
  const property = (value: unknown): boolean => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,127}$/.test(value);
  const absoluteUrl = (value: string): boolean => {
    try {
      const url = new URL(value);

      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  };

  function validateSource(source: JsonLdSource): void {
    requireValid(!!source && typeof source === 'object', 'Invalid JSON-LD source');
    requireValid(keys(source, ['kind', 'value', 'name', 'objectId', 'pageId', 'urlId', 'url', 'path', 'role']),
      'Invalid JSON-LD source fields');

    if ('path' in source && source.path !== undefined) {
      requireValid(Array.isArray(source.path) && source.path.length <= 8
            && source.path.every((part: unknown) => identifier(part)
              && !['constructor', 'prototype', '__proto__'].includes(String(part))), 'Invalid JSON-LD value path');
    }

    switch (source.kind) {
      case JsonLdSourceKind.Constant:
        requireValid(typeof source.value === 'string' || typeof source.value === 'boolean'
              || (typeof source.value === 'number' && Number.isFinite(source.value))
              || (Array.isArray(source.value) && source.value.length <= 1024 && source.value.every((item: unknown) =>
                typeof item === 'string' || typeof item === 'boolean'
                || typeof item === 'number' && Number.isFinite(item))), 'Invalid JSON-LD constant');
        break;
      case JsonLdSourceKind.PageField:
      case JsonLdSourceKind.TemplateVariable:
      case JsonLdSourceKind.Snippet:
        requireValid(identifier(source.name), 'Invalid JSON-LD source name');
        break;
      case JsonLdSourceKind.SharedObject:
        requireValid(identifier(source.objectId), 'Invalid JSON-LD object reference');
        break;
      case JsonLdSourceKind.CurrentPage:
        break;
      case JsonLdSourceKind.CurrentNode:
        requireValid(identifier(source.role), 'Invalid JSON-LD node role');
        break;
      case JsonLdSourceKind.PageEntity:
        requireValid(identifier(source.pageId) && identifier(source.role), 'Invalid JSON-LD entity reference');
        break;
      case JsonLdSourceKind.Page:
        requireValid(identifier(source.pageId), 'Invalid JSON-LD page reference');
        break;
      case JsonLdSourceKind.ExactUrl:
        requireValid(identifier(source.urlId) && identifier(source.pageId), 'Invalid JSON-LD URL reference');
        break;
      case JsonLdSourceKind.ExternalUrl:
        requireValid(typeof source.url === 'string' && absoluteUrl(source.url), 'Invalid JSON-LD external URL');
        break;
      default:
        throw new BusinessError(BusinessErrorCode.Validation, 'Unknown JSON-LD source');
    }
  }

  requireValid(keys(catalog, ['siteId', 'version', 'profiles', 'objects'])
    && identifier(catalog.siteId) && label(catalog.version), 'Invalid JSON-LD catalog identity');
  requireValid(Array.isArray(catalog.profiles) && catalog.profiles.length <= 256
    && Array.isArray(catalog.objects) && catalog.objects.length <= 1024, 'Invalid JSON-LD catalog size');
  const profileIds = new Set<string>();
  const objectIds = new Set<string>();

  for (const object of catalog.objects) {
    requireValid(!!object && typeof object === 'object', 'Invalid JSON-LD object');
    requireValid(keys(object, ['objectId', 'name', 'type', 'properties'])
      && identifier(object.objectId) && label(object.name) && !objectIds.has(object.objectId)
      && ['Person', 'Organization'].includes(object.type), 'Invalid or duplicate JSON-LD object');
    objectIds.add(object.objectId);
  }

  for (const profile of catalog.profiles) {
    requireValid(!!profile && typeof profile === 'object', 'Invalid JSON-LD profile');
    requireValid(keys(profile, ['profileId', 'name', 'templateIds', 'nodes'])
      && identifier(profile.profileId) && label(profile.name) && !profileIds.has(profile.profileId)
      && Array.isArray(profile.templateIds) && profile.templateIds.length <= 256
      && new Set(profile.templateIds).size === profile.templateIds.length
      && profile.templateIds.every(identifier) && Array.isArray(profile.nodes)
      && profile.nodes.length > 0 && profile.nodes.length <= 64, 'Invalid or duplicate JSON-LD profile');
    profileIds.add(profile.profileId);
    const roles = new Set<string>();

    for (const node of profile.nodes) {
      requireValid(!!node && typeof node === 'object', 'Invalid JSON-LD profile node');
      requireValid(keys(node, ['role', 'type', 'mappings', 'keySource', 'presenceSource']) && identifier(node.role)
        && property(node.type) && !roles.has(node.role)
        && Array.isArray(node.mappings) && node.mappings.length <= 128, 'Invalid JSON-LD profile node');
      roles.add(node.role);

      for (const name of ['keySource', 'presenceSource'] as const) {
        const source = node[name];

        if (source !== undefined) {
          validateSource(source);
          requireValid([JsonLdSourceKind.Constant, JsonLdSourceKind.PageField,
            JsonLdSourceKind.TemplateVariable, JsonLdSourceKind.Snippet].includes(source.kind),
          'Invalid JSON-LD node setting source: ' + node.role + '.' + name);
        }
      }
      const properties = new Set<string>();

      for (const mapping of node.mappings) {
        requireValid(!!mapping && typeof mapping === 'object', 'Invalid JSON-LD mapping');
        requireValid(keys(mapping, ['property', 'required', 'source'])
          && property(mapping.property) && !properties.has(mapping.property)
          && typeof mapping.required === 'boolean' && !!mapping.source && typeof mapping.source === 'object',
        'Invalid JSON-LD mapping');
        properties.add(mapping.property);
        const source = mapping.source;

        validateSource(source);
      }
    }
  }

  for (const object of catalog.objects) {
    requireValid(!!object.properties && typeof object.properties === 'object'
      && !Array.isArray(object.properties) && Object.keys(object.properties).length <= 128,
    'Invalid JSON-LD object properties');

    for (const [name, value] of Object.entries(object.properties)) {
      requireValid(property(name) && !!value && typeof value === 'object'
        && keys(value, ['kind', 'value', 'key', 'required', 'reference']), 'Invalid JSON-LD object property');

      if (value.kind === JsonLdValueKind.List) {
        requireValid(Array.isArray(value.value) && value.value.length <= 1024 && value.value.every((item: unknown) =>
          typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)),
        'Invalid JSON-LD list');
      } else if (value.kind === JsonLdValueKind.Text) {
        requireValid(typeof value.value === 'string', 'Invalid JSON-LD text');
      } else if (value.kind === JsonLdValueKind.Number) {
        requireValid(typeof value.value === 'number' && Number.isFinite(value.value), 'Invalid JSON-LD number');
      } else if (value.kind === JsonLdValueKind.Boolean) {
        requireValid(typeof value.value === 'boolean', 'Invalid JSON-LD boolean');
      } else if (value.kind === JsonLdValueKind.Node) {
        requireValid(identifier(value.key) && typeof value.required === 'boolean', 'Invalid JSON-LD node reference');
      } else if (value.kind === JsonLdValueKind.Url) {
        requireValid(typeof value.required === 'boolean' && !!value.reference, 'Invalid JSON-LD URL reference');
        const ref = value.reference;

        requireValid(keys(ref, ['kind', 'pageId', 'urlId', 'url']), 'Invalid JSON-LD URL reference fields');

        if (ref.kind === JsonLdReferenceKind.Page) {
          requireValid(identifier(ref.pageId), 'Invalid JSON-LD page');
        } else if (ref.kind === JsonLdReferenceKind.Exact) {
          requireValid(identifier(ref.pageId) && identifier(ref.urlId), 'Invalid JSON-LD exact URL');
        } else if (ref.kind === JsonLdReferenceKind.External) {
          requireValid(typeof ref.url === 'string' && absoluteUrl(ref.url), 'Invalid JSON-LD external URL');
        } else {
          throw new BusinessError(BusinessErrorCode.Validation, 'Unknown JSON-LD URL reference');
        }
      } else {
        throw new BusinessError(BusinessErrorCode.Validation, 'Unknown JSON-LD value');
      }
    }
  }
}
