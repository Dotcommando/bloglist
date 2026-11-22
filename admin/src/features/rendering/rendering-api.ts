import { object, request, string } from '../../shared/api/content-api';
import { readSnippetCachePolicy } from '../pages/request-cache';
import {
  BackupState, ElementKind, type IParameterField, type IRenderingElement, ParameterKind, SnippetExecution,
} from './rendering.types';

export function parameters(value: unknown, depth = 0): IParameterField[] {
  if (!Array.isArray(value) || depth > 16) {
    throw new Error('Invalid parameter response');
  }

  return value.map((entry: unknown) => {
    const row = object(entry);
    const kind = Object.values(ParameterKind).find((kind) => kind === row.kind);

    if (!kind || typeof row.required !== 'boolean') {
      throw new Error('Invalid parameter type');
    }

    return {
      name: string(row.name),
      kind,
      required: row.required,
      ...(row.nullable === undefined ? {} : { nullable: row.nullable === true }),
      ...(Object.hasOwn(row, 'defaultValue') ? { defaultValue: row.defaultValue } : {}),
      ...(row.properties === undefined ? {} : { properties: parameters(row.properties, depth + 1) }),
      ...(row.items === undefined ? {} : { items: parameters([row.items], depth + 1)[0]! }),
      ...(row.values === undefined ? {} : { values: Array.isArray(row.values) ? row.values.map(string) : [] }),
    };
  });
}

function element(value: unknown): IRenderingElement {
  const row = object(value);
  const kind = Object.values(ElementKind).find((kind) => kind === row.kind);
  const backupState = Object.values(BackupState).find((state) => state === row.backupState);

  if (!kind || !backupState || row.browserTypeScript !== null && typeof row.browserTypeScript !== 'string') {
    throw new Error('Invalid rendering element');
  }

  return {
    id: string(row.key),
    name: string(row.name),
    siteId: string(row.siteId),
    kind,
    version: string(row.version),
    backupState,
    html: string(row.html),
    css: string(row.css),
    browserTypeScript: row.browserTypeScript,
    parameters: parameters(row.parameters),
    ...(row.snippet ? {
      snippet: (() => {
        const snippet = object(row.snippet);
        const execution = Object.values(SnippetExecution).find((mode) => mode === snippet.execution);

        if (!Array.isArray(snippet.phases) || snippet.execution !== undefined && execution === undefined) {
          throw new Error('Invalid Snippet phases');
        }

        return {
          code: string(snippet.code),
          output: parameters([snippet.output])[0]!,
          phases: snippet.phases.map(string),
          ...(execution === undefined ? {} : { execution }),
          ...(snippet.cache === undefined ? {} : { cache: readSnippetCachePolicy(snippet.cache) }),
        };
      })(),
    } : {}),
    usages: Array.isArray(row.usages) ? row.usages.map((entry: unknown) => {
      const usage = object(entry);

      if (!['Page', 'Template', 'Chunk'].includes(string(usage.kind))) {
        throw new Error('Invalid usage');
      }

      return {
        kind: string(usage.kind),
        id: string(usage.id),
        title: string(usage.title),
        ...(usage.readable === true ? { readable: true } : {}),
      };
    }) : [],
  };
}

function path(siteId: string, kind: ElementKind, id?: string): string {
  return '/' + encodeURIComponent(siteId) + (kind === ElementKind.Template ? '/templates'
    : kind === ElementKind.Chunk ? '/chunks' : '/snippets')
    + (id ? '/' + encodeURIComponent(id) : '');
}

function scoped(value: unknown, siteId: string, kind: ElementKind, id?: string): IRenderingElement {
  const result = element(value);

  if (result.siteId !== siteId || result.kind !== kind || id !== undefined && result.id !== id) {
    throw new Error('Foreign rendering element');
  }

  return result;
}

export async function listElements(siteId: string, kind: ElementKind): Promise<IRenderingElement[]> {
  const data = object(await request(path(siteId, kind)));

  if (!Array.isArray(data.items)) {
    throw new Error('Invalid elements list');
  }

  return data.items.map((item: unknown) => scoped(item, siteId, kind));
}

export async function getElement(siteId: string, kind: ElementKind, id: string): Promise<IRenderingElement> {
  return scoped(await request(path(siteId, kind, id)), siteId, kind, id);
}

export async function saveElement(value: IRenderingElement, creating: boolean): Promise<IRenderingElement> {
  const input = {
    name: value.name,
    html: value.html,
    css: value.css,
    browserTypeScript: value.browserTypeScript,
    parameters: value.parameters,
    ...(value.snippet ? { snippet: value.snippet } : {}),
    ...(creating ? {} : { expectedVersion: value.version, ...(value.snippet ? { draftOnly: true } : {}) }),
  };
  const result = await request(path(value.siteId, value.kind, creating ? undefined : value.id), input);

  return scoped(result, value.siteId, value.kind, creating ? undefined : value.id);
}

export async function previewElement(value: IRenderingElement, pageId: string): Promise<string> {
  const data = object(await request(path(value.siteId, value.kind, value.id) + '/preview',
    { pageId, expectedVersion: value.version }, 120000));
  const url = string(data.url);

  if (!/^\/api\/admin\/rendering-previews\/[a-f0-9]{48}$/.test(url)) {
    throw new Error('Invalid preview address');
  }

  return url;
}
