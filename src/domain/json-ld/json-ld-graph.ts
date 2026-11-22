export enum JsonLdValueKind {
  Text = 'text', Number = 'number', Boolean = 'boolean', Node = 'node', Url = 'url', List = 'list',
}

export enum JsonLdReferenceKind { Page = 'page', Exact = 'exact', External = 'external' }

export enum JsonLdRouteKind { Page = 'page', Redirect = 'redirect' }

export type JsonLdReference =
  | { readonly kind: JsonLdReferenceKind.Page; readonly pageId: string }
  | { readonly kind: JsonLdReferenceKind.Exact; readonly urlId: string; readonly pageId: string }
  | { readonly kind: JsonLdReferenceKind.External; readonly url: string };

export type JsonLdScalar = string | number | boolean;

export type JsonLdProperty = JsonLdScalar | { readonly '@id': string } | readonly JsonLdScalar[];

export type JsonLdValue =
  | { readonly kind: JsonLdValueKind.List; readonly value: readonly JsonLdScalar[] }
  | { readonly kind: JsonLdValueKind.Text; readonly value: string }
  | { readonly kind: JsonLdValueKind.Number; readonly value: number }
  | { readonly kind: JsonLdValueKind.Boolean; readonly value: boolean }
  | { readonly kind: JsonLdValueKind.Node; readonly key: string; readonly required: boolean }
  | { readonly kind: JsonLdValueKind.Url; readonly reference: JsonLdReference; readonly required: boolean };

export interface IJsonLdNode {
  readonly key: string;
  readonly role: string;
  readonly type: string;
  readonly properties: Readonly<Record<string, JsonLdValue>>;
}

export type JsonLdRoute =
  | { readonly kind: JsonLdRouteKind.Page; readonly pageId: string; readonly urlId: string; readonly path: string }
  | { readonly kind: JsonLdRouteKind.Redirect; readonly urlId: string; readonly path: string; readonly pageId: string };

export interface IJsonLdGraph {
  readonly '@context': 'https://schema.org';
  readonly '@graph': readonly Readonly<Record<string, JsonLdProperty>>[];
}

export interface IJsonLdGraphInput {
  readonly origin: string;
  readonly root: string;
  readonly additionalRoots?: readonly string[];
  readonly nodes: readonly IJsonLdNode[];
  readonly routes: readonly JsonLdRoute[];
}

export interface IJsonLdGraphResult {
  readonly graph: IJsonLdGraph;
  readonly warnings: readonly { readonly node: string; readonly property: string; readonly urlId: string }[];
}

export function assembleJsonLdGraph(input: IJsonLdGraphInput): IJsonLdGraphResult {
  const origin = new URL(input.origin);

  if (
    !['https:', 'http:'].includes(origin.protocol)
    || origin.username
    || origin.password
    || origin.pathname !== '/'
    || origin.search
    || origin.hash
  ) {
    throw new Error('Invalid JSON-LD origin');
  }

  const groups = new Map<string, IJsonLdNode[]>();

  for (const node of input.nodes) {
    if (
      !/^[A-Za-z0-9_-]{1,512}$/.test(node.key)
      || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(node.role)
      || !/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(node.type)
    ) {
      throw new Error('Invalid JSON-LD node identity');
    }
    groups.set(node.key, [...groups.get(node.key) ?? [], node]);
  }

  const graph: Record<string, JsonLdProperty>[] = [];
  const warnings: { node: string; property: string; urlId: string }[] = [];
  const visited = new Set<string>();
  const ids = new Set<string>();

  function visit(key: string): string | null {
    const contributions = groups.get(key);

    if (!contributions?.length) {
      return null;
    }

    const first = contributions[0]!;
    const id = `${origin.origin}/#${first.role}-${first.key}`;

    if (visited.has(key)) {
      return id;
    }
    if (ids.has(id)) {
      throw new Error(`Conflicting JSON-LD identity: ${key}`);
    }
    ids.add(id);
    visited.add(key);
    const result: Record<string, JsonLdProperty> = {
      '@id': id,
      '@type': first.type,
    };

    graph.push(result);

    for (const node of contributions) {
      if (node.role !== first.role || node.type !== first.type) {
        throw new Error(`Conflicting JSON-LD node: ${key}`);
      }

      for (const [property, source] of Object.entries(node.properties)) {
        if (!/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(property)) {
          throw new Error(`Invalid JSON-LD property: ${key}`);
        }

        let value: JsonLdProperty | null = null;

        if (source.kind === JsonLdValueKind.List) {
          if (
            !Array.isArray(source.value)
            || source.value.length > 1024
            || !source.value.every((item) =>
              typeof item === 'string' || typeof item === 'boolean'
              || typeof item === 'number' && Number.isFinite(item))
          ) {
            throw new Error(`Invalid JSON-LD list: ${key}.${property}`);
          }
          value = source.value;
        } else if (source.kind === JsonLdValueKind.Text) {
          value = source.value;
        } else if (source.kind === JsonLdValueKind.Number) {
          if (!Number.isFinite(source.value)) {
            throw new Error(`Invalid JSON-LD number: ${key}.${property}`);
          }
          value = source.value;
        } else if (source.kind === JsonLdValueKind.Boolean) {
          value = source.value;
        } else if (source.kind === JsonLdValueKind.Node) {
          const reference = visit(source.key);

          if (reference) {
            value = { '@id': reference };
          }
        } else if (source.reference.kind === JsonLdReferenceKind.External) {
          const external = new URL(source.reference.url);

          if (!['https:', 'http:'].includes(external.protocol) || external.username || external.password) {
            throw new Error(`Invalid JSON-LD URL: ${key}.${property}`);
          }
          value = external.href;
        } else {
          const reference = source.reference;
          const route = input.routes.find((item) => reference.kind === JsonLdReferenceKind.Page
            ? item.kind === JsonLdRouteKind.Page && item.pageId === reference.pageId : item.urlId === reference.urlId);

          if (route && reference.kind === JsonLdReferenceKind.Exact && route.pageId !== reference.pageId) {
            throw new Error(`Rebound JSON-LD reference: ${key}.${property}`);
          }
          if (route) {
            if (!route.path.startsWith('/') || route.path.startsWith('//') || /[?#\\]/.test(route.path)) {
              throw new Error(`Invalid JSON-LD path: ${key}.${property}`);
            }
            value = new URL(route.path, origin).href;

            if (route.kind === JsonLdRouteKind.Redirect) {
              warnings.push({ node: key, property, urlId: route.urlId });
            }
          }
        }
        if (value === null) {
          if ('required' in source && source.required) {
            throw new Error(`Missing JSON-LD reference: ${key}.${property}`);
          }
          continue;
        }
        if (Object.hasOwn(result, property) && JSON.stringify(result[property]) !== JSON.stringify(value)) {
          throw new Error(`Conflicting JSON-LD property: ${key}.${property}`);
        }
        result[property] = value;
      }
    }

    return id;
  }

  for (const root of [input.root, ...input.additionalRoots ?? []]) {
    if (!visit(root)) {
      throw new Error(`Missing JSON-LD root: ${root}`);
    }
  }

  return { graph: { '@context': 'https://schema.org', '@graph': graph }, warnings };
}

export function serializeJsonLd(graph: IJsonLdGraph): string {
  return JSON.stringify(graph).replace(/[<>&\u2028\u2029]/g, (value) =>
    `\\u${value.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
