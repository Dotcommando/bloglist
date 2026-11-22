import type { IPageState } from '../../../domain/pages/page.js';
import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type { ITemplateVariableCatalog } from '../../../domain/template-variables/template-variable.js';

export interface ITemplateVariableStore {
  read(siteId: string): Promise<ITemplateVariableCatalog>;
  save(catalog: ITemplateVariableCatalog, expectedVersion: string): Promise<void>;
}

export interface ITemplateVariableTemplates {
  list(siteId: string): Promise<readonly { readonly key: string }[]>;
}

export interface IPageTemplateVariableStore {
  save(expected: IPageState, next: IPageState, catalogVersion: string,
    mediaVersion: string | null): Promise<IPageState>;
}

export interface ITemplateVariableMedia {
  read(siteId: string): Promise<{ readonly version: string;
    readonly pending: boolean;
    readonly files: readonly { readonly fileId: string;
      readonly mimeType: string;
      readonly name: string;
      readonly outputs: readonly { readonly key: string;
        readonly url: string;
        readonly mimeType: string;
        readonly dimensions: { readonly width: number; readonly height: number } | null }[] }[] }>;
}

export interface ITemplateVariablePublication {
  freeze(page: IPageState): Promise<ITemplateObject>;
  prepare(siteId: string, values: ITemplateObject): Promise<ITemplateObject>;
}
