import type { RequestCacheScope } from '../../shared/api/content.types.js';

export enum SnippetExecution { Sequential = 'Sequential', ParallelRead = 'ParallelRead' }

export enum ElementKind { Template = 'Template', Chunk = 'Chunk', Snippet = 'Snippet' }

export enum BackupState { Pending = 'Pending', Ready = 'Ready' }

export enum ElementSaveIntent { Draft = 'Draft', Apply = 'Apply' }

export enum ElementSaveFeedback {
  Draft = 'Draft', Applied = 'Applied', ApplyFailed = 'ApplyFailed', ApplyRejected = 'ApplyRejected',
}

export enum TemplateValidationIssue {
  MissingParameterSeparator = 'MissingParameterSeparator',
  UnknownChunkParameter = 'UnknownChunkParameter',
  MissingChunkParameter = 'MissingChunkParameter',
}

export interface ITemplateDiagnostic {
  issue: TemplateValidationIssue;
  source?: { kind: ElementKind; key: string };
  parameter?: string;
}

export function readTemplateDiagnostic(value: unknown): ITemplateDiagnostic | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const data = Object.fromEntries(Object.entries(value));
  const issue = Object.values(TemplateValidationIssue).find((issue) => issue === data.issue);

  if (
    !issue
    || issue !== TemplateValidationIssue.MissingParameterSeparator
    && (typeof data.parameter !== 'string'
    || !/^[A-Za-z][A-Za-z0-9_]*$/.test(data.parameter))
  ) {
    return null;
  }

  let source: ITemplateDiagnostic['source'];

  if (data.source !== undefined) {
    if (!data.source || typeof data.source !== 'object' || Array.isArray(data.source)) {
      return null;
    }

    const raw = Object.fromEntries(Object.entries(data.source));
    const kind = Object.values(ElementKind).find((kind) => kind === raw.kind);

    if (!kind || typeof raw.key !== 'string' || !/^[A-Za-z0-9_]{1,128}$/.test(raw.key)) {
      return null;
    }
    source = { kind, key: raw.key };
  }

  return {
    issue,
    ...(source ? { source } : {}),
    ...(typeof data.parameter === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(data.parameter)
      ? { parameter: data.parameter } : {}),
  };
}

export enum ParameterKind {
  String = 'String',
  Number = 'Number',
  Boolean = 'Boolean',
  Object = 'Object',
  Array = 'Array',
  Enum = 'Enum',
}

export enum SourceFile {
  Html = 'html', Css = 'css', Script = 'browserTypeScript', Parameters = 'parameters',
  Server = 'server', Output = 'output',
}

export function chunkNameAlias(name: string): string | null {
  const alias = name.replace(/\s/gu, '_');

  return /^[\p{L}\p{M}\p{N}_.-]{1,200}$/u.test(alias) ? alias : null;
}

export interface IParameterField {
  name: string;
  kind: ParameterKind;
  required: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
  properties?: IParameterField[];
  items?: IParameterField;
  values?: string[];
}

export interface IRenderingElement {
  snippet?: { code: string;
    output: IParameterField;
    phases: string[];
    execution?: SnippetExecution;
    cache?: { scope: RequestCacheScope; maxAgeMs: number } };
  siteId: string;
  id: string;
  name: string;
  kind: ElementKind;
  version: string;
  backupState: BackupState;
  html: string;
  css: string;
  browserTypeScript: string | null;
  parameters: IParameterField[];
  usages: { kind: string; id: string; title: string; readable?: true }[];
}

export interface IElementBuffer {
  element: IRenderingElement;
  file: SourceFile;
  dirty: boolean;
  savedContent: string;
  selection: Partial<Record<SourceFile, { start: number; end: number; scrollTop: number; scrollLeft: number }>>;
}

export function elementFingerprint(element: IRenderingElement): string {
  return JSON.stringify({
    id: element.id,
    name: element.name,
    html: element.html,
    css: element.css,
    browserTypeScript: element.browserTypeScript,
    parameters: element.parameters,
    ...(element.snippet ? { snippet: element.snippet } : {}),
  });
}
