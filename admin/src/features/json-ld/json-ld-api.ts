import { object, request, string } from '../../shared/api/content-api.js';

export enum JsonLdTab { Profiles = 'profiles', Objects = 'objects' }

export enum JsonLdPreset {
  Person = 'Person',
  Organization = 'Organization',
  WebPage = 'WebPage',
  Article = 'Article',
  Service = 'Service',
}

export enum JsonLdSourceKind {
  Constant = 'constant', PageField = 'pageField', TemplateVariable = 'templateVariable', Snippet = 'snippet',
  SharedObject = 'sharedObject', CurrentPage = 'currentPage', Page = 'page', ExactUrl = 'exactUrl',
  ExternalUrl = 'externalUrl', CurrentNode = 'currentNode', PageEntity = 'pageEntity',
}

export interface IJsonLdSource {
  kind: JsonLdSourceKind;
  value?: string | number | boolean | (string | number | boolean)[];
  name?: string;
  path?: string[];
  objectId?: string;
  role?: string;
  pageId?: string;
  urlId?: string;
  url?: string;
}

export interface IJsonLdMapping {
  property: string;
  required: boolean;
  source: IJsonLdSource;
}

export interface IJsonLdNode {
  role: string;
  type: string;
  keySource?: IJsonLdSource;
  presenceSource?: IJsonLdSource;
  mappings: IJsonLdMapping[];
}

export interface IJsonLdProfile {
  profileId: string;
  name: string;
  templateIds: string[];
  nodes: IJsonLdNode[];
}

export interface IJsonLdValue {
  kind: string;
  value?: string | number | boolean | (string | number | boolean)[];
  key?: string;
  required?: boolean;
  reference?: { kind: string; pageId?: string; urlId?: string; url?: string };
}

export interface IJsonLdObject {
  objectId: string;
  name: string;
  type: string;
  properties: Record<string, IJsonLdValue>;
}

export interface IJsonLdCatalog {
  siteId: string;
  version: string;
  profiles: IJsonLdProfile[];
  objects: IJsonLdObject[];
}

function scalar(value: unknown): string | number | boolean | (string | number | boolean)[] {
  if (
    Array.isArray(value)
    && value.length <= 1024
    && value.every((item: unknown) =>
      typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item))
  ) {
    return value;
  }
  if (
    typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
    && Number.isFinite(value)
  ) {
    return value;
  }
  throw new Error('Invalid JSON-LD value');
}

function items<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid JSON-LD list');
  }

  return value.map(parse);
}

function source(value: unknown): IJsonLdSource {
  const raw = object(value);
  const kind = Object.values(JsonLdSourceKind).find((kind) => raw.kind === kind);

  if (!kind) {
    throw new Error('Unknown JSON-LD source');
  }

  return {
    kind,
    ...(raw.role === undefined ? {} : { role: string(raw.role) }),
    ...(raw.value === undefined ? {} : { value: scalar(raw.value) }),
    ...(raw.name === undefined ? {} : { name: string(raw.name) }),
    ...(raw.path === undefined ? {} : { path: items(raw.path, string) }),
    ...(raw.objectId === undefined ? {} : { objectId: string(raw.objectId) }),
    ...(raw.pageId === undefined ? {} : { pageId: string(raw.pageId) }),
    ...(raw.urlId === undefined ? {} : { urlId: string(raw.urlId) }),
    ...(raw.url === undefined ? {} : { url: string(raw.url) }),
  };
}

function readValue(value: unknown): IJsonLdValue {
  const raw = object(value);
  const ref = raw.reference === undefined ? undefined : object(raw.reference);

  return {
    kind: string(raw.kind),
    ...(raw.value === undefined ? {} : { value: scalar(raw.value) }),
    ...(raw.key === undefined ? {} : { key: string(raw.key) }),
    ...(raw.required === undefined ? {} : { required: raw.required === true }),
    ...(ref === undefined ? {} : {
      reference: {
        kind: string(ref.kind),
        ...(ref.pageId === undefined ? {} : { pageId: string(ref.pageId) }),
        ...(ref.urlId === undefined ? {} : { urlId: string(ref.urlId) }),
        ...(ref.url === undefined ? {} : { url: string(ref.url) }),
      },
    }),
  };
}

export function readJsonLdCatalog(value: unknown, siteId: string): IJsonLdCatalog {
  const raw = object(value);

  if (raw.siteId !== siteId) {
    throw new Error('Foreign JSON-LD catalog');
  }

  return {
    siteId,
    version: string(raw.version),
    profiles: items(raw.profiles, (value) => {
      const row = object(value);

      return {
        profileId: string(row.profileId),
        name: string(row.name),
        templateIds: items(row.templateIds, string),
        nodes: items(row.nodes, (value) => {
          const node = object(value);

          return {
            role: string(node.role),
            type: string(node.type),
            ...(node.keySource === undefined ? {} : { keySource: source(node.keySource) }),
            ...(node.presenceSource === undefined ? {} : { presenceSource: source(node.presenceSource) }),
            mappings: items(node.mappings, (value) => {
              const mapping = object(value);

              if (typeof mapping.required !== 'boolean') {
                throw new Error('Invalid required flag');
              }

              return { property: string(mapping.property), required: mapping.required, source: source(mapping.source) };
            }),
          };
        }),
      };
    }),
    objects: items(raw.objects, (value) => {
      const row = object(value);

      return {
        objectId: string(row.objectId),
        name: string(row.name),
        type: string(row.type),
        properties: Object.fromEntries(Object.entries(object(row.properties))
          .map(([key, value]) => [key, readValue(value)])),
      };
    }),
  };
}

export async function loadJsonLdCatalog(siteId: string): Promise<IJsonLdCatalog> {
  return readJsonLdCatalog(await request('/' + encodeURIComponent(siteId) + '/json-ld'), siteId);
}

export async function saveJsonLdCatalog(catalog: IJsonLdCatalog): Promise<IJsonLdCatalog> {
  return readJsonLdCatalog(await request('/' + encodeURIComponent(catalog.siteId) + '/json-ld', {
    expectedVersion: catalog.version, profiles: catalog.profiles, objects: catalog.objects,
  }), catalog.siteId);
}
