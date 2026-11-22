import {
  type IJsonLdProfileNode, type JsonLdSource, JsonLdSourceKind, type JsonLdValueSource, validateJsonLdCatalog,
} from '../../../domain/json-ld/json-ld-catalog.js';
import {
  assembleJsonLdGraph, type IJsonLdGraphResult, type IJsonLdNode, JsonLdReferenceKind,
  JsonLdRouteKind,
  type JsonLdValue, JsonLdValueKind,
} from '../../../domain/json-ld/json-ld-graph.js';
import { JsonLdValidationError } from '../../../domain/json-ld/json-ld-validation.error.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IBuildJsonLdPage, IBuildJsonLdPageInput,
} from '../../../ports/inbound/json-ld/build-json-ld-page.port.js';

function key(prefix: string, ...parts: string[]): string {
  return prefix + '-' + Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

function selectedValue(value: unknown, path: readonly string[] | undefined): unknown {
  let current = value;

  for (const part of path ?? []) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) {
      return undefined;
    }
    current = Object.fromEntries(Object.entries(current))[part];
  }

  return current;
}

export class BuildJsonLdPageUseCase implements IBuildJsonLdPage {
  execute(input: IBuildJsonLdPageInput): IJsonLdGraphResult | null {
    return this.build(input, false);
  }

  validateDeferred(input: IBuildJsonLdPageInput): void {
    this.build(input, true);
  }

  private build(input: IBuildJsonLdPageInput, deferSnippets: boolean): IJsonLdGraphResult | null {
    validateJsonLdCatalog(input.catalog);

    if (input.catalog.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign JSON-LD catalog');
    }

    const profiles = input.catalog.profiles.filter((profile) => profile.templateIds.includes(input.templateId));
    const roots: string[] = [];
    const nodes: IJsonLdNode[] = [];
    const webPage = profiles.flatMap((profile) => profile.nodes).find((node) => node.type === 'WebPage');
    const definitions = profiles.flatMap((profile) => profile.nodes);
    const identities = new Map<IJsonLdProfileNode, string | null>();

    function deferred(source: JsonLdValueSource): boolean {
      return deferSnippets && source.kind === JsonLdSourceKind.Snippet
        && selectedValue(input.snippetValues[source.name], source.path) === undefined;
    }

    function settingValue(source: JsonLdValueSource): unknown {
      switch (source.kind) {
        case JsonLdSourceKind.Constant:
          return source.value;
        case JsonLdSourceKind.PageField:
          return input.pageFields[source.name === 'description' ? 'metaDescription' : source.name];
        case JsonLdSourceKind.TemplateVariable:
          return selectedValue(input.templateValues[source.name], source.path);
        case JsonLdSourceKind.Snippet:
          return selectedValue(input.snippetValues[source.name], source.path);
      }
    }

    function identity(node: IJsonLdProfileNode): string | null {
      if (identities.has(node)) {
        return identities.get(node)!;
      }

      const location = node.role + '.';

      if (node.presenceSource && !deferred(node.presenceSource)) {
        const present = settingValue(node.presenceSource);

        if (present !== null && present !== undefined && typeof present !== 'boolean') {
          throw new JsonLdValidationError('Expected boolean JSON-LD value: ' + location + 'presenceSource');
        }
        if (present !== true) {
          identities.set(node, null);

          return null;
        }
      }

      let nodeKey = key('page', input.pageId, node.role);

      if (node.keySource) {
        const value = deferred(node.keySource) ? 'deferred' : settingValue(node.keySource);

        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
          throw new JsonLdValidationError('Invalid JSON-LD entity key: ' + location + 'keySource');
        }
        nodeKey = key('entity', node.role, value);
      }
      identities.set(node, nodeKey);

      return nodeKey;
    }

    function roleIdentity(role: string): string {
      const keys = new Set(definitions.filter((node) => node.role === role).map(identity)
        .filter((value) => value !== null));

      if (keys.size > 1) {
        throw new JsonLdValidationError('Ambiguous JSON-LD node role: ' + role);
      }

      return keys.values().next().value ?? key('page', input.pageId, role);
    }

    function resolve(source: JsonLdSource, required: boolean, location: string): JsonLdValue | null {
      let value: unknown;

      switch (source.kind) {
        case JsonLdSourceKind.Constant:
          value = source.value;
          break;
        case JsonLdSourceKind.PageField:
          value = input.pageFields[source.name];

          if (source.name === 'description' && value === undefined) {
            value = input.pageFields.metaDescription;
          }
          break;
        case JsonLdSourceKind.TemplateVariable:
          value = selectedValue(input.templateValues[source.name], source.path);

          if (!source.path?.length && value && typeof value === 'object') {
            const media = Object.fromEntries(Object.entries(value));

            value = media.exists === true ? media.src ?? media.url : undefined;

            if (typeof value === 'string' && value.length) {
              const mediaUrl = new URL(value, input.origin);

              if (!['https:', 'http:'].includes(mediaUrl.protocol) || mediaUrl.username || mediaUrl.password) {
                throw new JsonLdValidationError(`Invalid JSON-LD media: ${location}`);
              }

              return {
                kind: JsonLdValueKind.Url,
                required,
                reference: { kind: JsonLdReferenceKind.External, url: mediaUrl.href },
              };
            }
          }
          break;
        case JsonLdSourceKind.Snippet:
          value = selectedValue(input.snippetValues[source.name], source.path);

          if (deferSnippets && value === undefined) {
            value = 'Deferred public value';
          }
          break;
        case JsonLdSourceKind.SharedObject:
          return { kind: JsonLdValueKind.Node, key: key('object', source.objectId), required };
        case JsonLdSourceKind.CurrentPage:
          if (webPage) {
            return { kind: JsonLdValueKind.Node, key: roleIdentity(webPage.role), required };
          }
          break;
        case JsonLdSourceKind.CurrentNode:
          return { kind: JsonLdValueKind.Node, key: roleIdentity(source.role), required };
        case JsonLdSourceKind.PageEntity: {
          const binding = input.bindings?.find((item) => item.pageId === source.pageId);
          const definition = input.catalog.profiles.filter((profile) => binding
            && profile.templateIds.includes(binding.templateId)).flatMap((profile) => profile.nodes)
            .find((node) => node.role === source.role);
          const published = input.routes.some((route) => route.kind === JsonLdRouteKind.Page
            && route.pageId === source.pageId);

          if (!definition || !published) {
            break;
          }
          if (source.pageId === input.pageId) {
            return { kind: JsonLdValueKind.Node, key: roleIdentity(source.role), required };
          }
          if (definition.keySource || definition.presenceSource) {
            if (required) {
              throw new JsonLdValidationError('Dynamic JSON-LD entity requires current-page data: ' + location);
            }

            return null;
          }

          const identity = key('page', source.pageId, source.role);

          if (source.pageId !== input.pageId && !nodes.some((node) => node.key === identity)) {
            nodes.push({
              key: identity,
              role: definition.role,
              type: definition.type,
              properties: {
                url: {
                  kind: JsonLdValueKind.Url,
                  required: true,
                  reference: { kind: JsonLdReferenceKind.Page, pageId: source.pageId },
                },
              },
            });
          }

          return { kind: JsonLdValueKind.Node, key: identity, required };
        }
        case JsonLdSourceKind.Page:
          return {
            kind: JsonLdValueKind.Url, reference: { kind: JsonLdReferenceKind.Page, pageId: source.pageId }, required,
          };
        case JsonLdSourceKind.ExactUrl:
          return {
            kind: JsonLdValueKind.Url,
            reference: {
              kind: JsonLdReferenceKind.Exact, pageId: source.pageId, urlId: source.urlId,
            },
            required,
          };
        case JsonLdSourceKind.ExternalUrl:
          return {
            kind: JsonLdValueKind.Url, reference: { kind: JsonLdReferenceKind.External, url: source.url }, required,
          };
      }

      if (value instanceof Date && Number.isFinite(value.getTime())) {
        value = value.toISOString();
      }
      if (
        Array.isArray(value)
        && value.length <= 1024
        && value.every((item: unknown) =>
          typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item))
      ) {
        return { kind: JsonLdValueKind.List, value };
      }
      if (typeof value === 'string' && value.length) {
        return { kind: JsonLdValueKind.Text, value };
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return { kind: JsonLdValueKind.Number, value };
      }
      if (typeof value === 'boolean') {
        return { kind: JsonLdValueKind.Boolean, value };
      }
      if (required) {
        throw new JsonLdValidationError(`Missing JSON-LD value: ${location}`);
      }

      return null;
    }

    for (const profile of profiles) {
      for (const node of profile.nodes) {
        const nodeKey = identity(node);

        if (nodeKey === null) {
          continue;
        }

        const properties: Record<string, JsonLdValue> = {};

        for (const mapping of node.mappings) {
          const value = resolve(mapping.source, mapping.required, `${node.role}.${mapping.property}`);

          if (value !== null) {
            properties[mapping.property] = value;
          }
        }
        nodes.push({ key: nodeKey, role: node.role, type: node.type, properties });
        roots.push(nodeKey);
      }
    }

    if (!roots.length) {
      return null;
    }

    for (const object of input.catalog.objects) {
      const properties: Record<string, JsonLdValue> = {};

      for (const [name, value] of Object.entries(object.properties)) {
        properties[name] = value.kind === JsonLdValueKind.Node ? { ...value, key: key('object', value.key) } : value;
      }
      nodes.push({
        key: key('object', object.objectId), role: object.type.toLowerCase(), type: object.type, properties,
      });
    }

    try {
      return assembleJsonLdGraph({
        origin: input.origin, root: roots[0]!, additionalRoots: roots.slice(1), nodes, routes: input.routes,
      });
    } catch (failure) {
      if (!(failure instanceof Error)) {
        throw failure;
      }

      let message = failure.message;

      for (const node of nodes) {
        message = message.replaceAll(node.key, node.role);
      }
      throw new JsonLdValidationError(message);
    }
  }
}
