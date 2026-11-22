import type { ITemplateObject, TemplateValue } from '../pages/page-rendering.js';
import { LoaderPhase } from '../pages/page-rendering.js';
import { type IParameterContract, ParameterKind, TemplateSourceKind } from '../publication/render-plan.js';
import { parseSnippetCachePolicy } from '../publication/request-cache.policy.js';
import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { type ISnippetSource, SnippetExecution } from './snippet.js';

export enum ElementBackupState { Pending = 'Pending', Ready = 'Ready' }

export interface IElementIdentity {
  readonly siteId: string;
  readonly kind: TemplateSourceKind;
  readonly key: string;
}

export interface IElementContent {
  readonly snippet?: ISnippetSource;
  readonly name: string;
  readonly html: string;
  readonly css: string;
  readonly browserTypeScript: string | null;
  readonly parameters: readonly IParameterContract[];
}

export interface IRenderingElementState extends IElementIdentity, IElementContent {
  readonly elementId: string;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly backupState: ElementBackupState;
}

export enum ElementUsageKind { Page = 'Page', Template = 'Template', Chunk = 'Chunk' }

export interface IElementUsage {
  readonly kind: ElementUsageKind;
  readonly id: string;
  readonly title: string;
  readonly readable?: true;
}

export function elementRequirement(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new BusinessError(BusinessErrorCode.Validation, message);
  }
}

export function validateElementIdentity(value: IElementIdentity): void {
  elementRequirement(value.siteId.trim() && Object.values(TemplateSourceKind).includes(value.kind)
    && isElementKey(value.key), 'Invalid element identity');
}

export const maximumElementOrdinal = 9223372036854775807n;

export function isElementKey(key: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(key)
    || /^[1-9][0-9]{0,18}$/.test(key) && BigInt(key) <= maximumElementOrdinal;
}

function validValue(field: IParameterContract, value: TemplateValue): boolean {
  if (value === null) {
    return field.nullable === true;
  }

  switch (field.kind) {
    case ParameterKind.String: return typeof value === 'string';
    case ParameterKind.Number: return typeof value === 'number' && Number.isFinite(value);
    case ParameterKind.Boolean: return typeof value === 'boolean';
    case ParameterKind.Enum: return typeof value === 'string' && field.values?.includes(value) === true;
    case ParameterKind.Array:
      return Array.isArray(value) && field.items !== undefined
        && value.every((entry) => validValue(field.items!, entry));
    case ParameterKind.Object: {
      if (!isElementObject(value)) {
        return false;
      }

      const fields = field.properties ?? [];

      return Object.keys(value).every((key) => fields.some((item) => item.name === key))
        && fields.every((item) => Object.hasOwn(value, item.name) ? validValue(item, value[item.name]!)
          : !item.required || item.defaultValue !== undefined);
    }
  }
}

function isElementObject(value: TemplateValue): value is ITemplateObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateElementContent(value: IElementContent): void {
  elementRequirement(typeof value.name === 'string' && value.name.trim().length > 0
    && value.name.length <= 200 && !/\p{Cc}|\p{Zl}|\p{Zp}/u.test(value.name), 'Invalid element name');
  elementRequirement(typeof value.html === 'string' && typeof value.css === 'string'
    && (value.browserTypeScript === null || typeof value.browserTypeScript === 'string'), 'Invalid source text');
  let count = 0;
  const inspect = (fields: readonly IParameterContract[], depth: number): void => {
    elementRequirement(Array.isArray(fields) && depth <= 16, 'Invalid parameter nesting');
    elementRequirement(new Set(fields.map((field) => field.name)).size === fields.length, 'Duplicate parameters');

    for (const field of fields) {
      count++;
      elementRequirement(count <= 256 && /^[A-Za-z][A-Za-z0-9_]*$/.test(field.name)
        && !['constructor', 'prototype'].includes(field.name)
        && (depth > 0 || value.snippet !== undefined || !['page', 'site', 'request'].includes(field.name))
        && Object.values(ParameterKind).includes(field.kind) && typeof field.required === 'boolean'
        && (field.nullable === undefined || typeof field.nullable === 'boolean'), 'Invalid parameter contract');
      elementRequirement(Object.keys(field).every((key) => ['name', 'kind', 'required', 'defaultValue',
        'nullable', 'properties', 'items', 'values'].includes(key)), 'Unknown parameter field');

      if (field.kind === ParameterKind.Enum) {
        elementRequirement(field.values?.length && field.values.every((entry: unknown) => typeof entry === 'string')
          && new Set(field.values).size === field.values.length, 'Invalid enum values');
      } else {
        elementRequirement(field.values === undefined, 'Values require enum type');
      }
      if (field.kind === ParameterKind.Object) {
        inspect(field.properties ?? [], depth + 1);
      } else {
        elementRequirement(field.properties === undefined, 'Properties require object type');
      }
      if (field.kind === ParameterKind.Array) {
        elementRequirement(field.items !== undefined, 'Array items require a type');
        inspect([field.items], depth + 1);
      } else {
        elementRequirement(field.items === undefined, 'Items require array type');
      }
      elementRequirement(field.defaultValue === undefined || validValue(field, field.defaultValue),
        'Default value does not match the parameter type');
    }
  };

  inspect(value.parameters, 0);

  if (value.snippet !== undefined) {
    elementRequirement(typeof value.snippet.code === 'string' && value.snippet.code.length <= 100000
      && value.snippet.code.trim().length > 0 && Array.isArray(value.snippet.phases)
      && value.snippet.compiledJavaScript === undefined
      && (value.snippet.execution === undefined || Object.values(SnippetExecution).includes(value.snippet.execution))
      && value.snippet.phases.length > 0
      && new Set(value.snippet.phases).size === value.snippet.phases.length
      && value.snippet.phases.every((phase) => Object.values(LoaderPhase).includes(phase)), 'Invalid Snippet source');

    if (value.snippet.cache !== undefined) {
      parseSnippetCachePolicy(value.snippet.cache);
    }
    inspect([value.snippet.output], 0);
  }
}

export class RenderingElement {
  private readonly state: IRenderingElementState;

  constructor(state: IRenderingElementState) {
    validateElementIdentity(state);
    validateElementContent(state);
    elementRequirement((state.kind === TemplateSourceKind.Snippet) === (state.snippet !== undefined),
      'Snippet source belongs only to a Snippet');
    elementRequirement(state.kind !== TemplateSourceKind.Snippet
      || state.html === '' && state.css === '' && state.browserTypeScript === null, 'Invalid Snippet sources');
    elementRequirement(state.elementId.trim() && state.version.trim()
      && Number.isFinite(state.createdAt.getTime()) && state.updatedAt >= state.createdAt
      && Object.values(ElementBackupState).includes(state.backupState), 'Invalid element state');
    this.state = structuredClone(state);
  }

  toState(): IRenderingElementState {
    return structuredClone(this.state);
  }

  update(content: IElementContent, version: string, now: Date): RenderingElement {
    elementRequirement(this.state.backupState === ElementBackupState.Ready, 'Backup synchronization is pending');

    return new RenderingElement({
      ...this.state,
      ...content,
      version,
      updatedAt: now,
      backupState: ElementBackupState.Pending,
    });
  }
}
