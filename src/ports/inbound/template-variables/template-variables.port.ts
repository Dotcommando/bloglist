import type { IPageState } from '../../../domain/pages/page.js';
import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type {
  ITemplateVariable,
  ITemplateVariableCatalog,
} from '../../../domain/template-variables/template-variable.js';

export interface IListTemplateVariables {
  execute(input: { readonly siteId: string }): Promise<ITemplateVariableCatalog>;
}

export interface ISaveTemplateVariables {
  execute(input: { readonly siteId: string;
    readonly expectedVersion: string;
    readonly fields: readonly ITemplateVariable[] }): Promise<ITemplateVariableCatalog>;
}

export interface IPageTemplateVariableDetails {
  readonly catalog: ITemplateVariableCatalog;
  readonly values: ITemplateObject;
  readonly prepared: ITemplateObject;
  readonly templateId: string | null;
  readonly updatedAt: Date;
  readonly mediaVersion: string;
}

export interface IGetPageTemplateVariables {
  execute(input: { readonly siteId: string; readonly pageId: string }): Promise<IPageTemplateVariableDetails>;
}

export interface ISavePageTemplateVariables {
  execute(input: { readonly siteId: string;
    readonly pageId: string;
    readonly templateId: string;
    readonly values: ITemplateObject;
    readonly expectedUpdatedAt: Date;
    readonly catalogVersion: string;
    readonly mediaVersion: string }): Promise<IPageState>;
}

export interface ITemplateVariableOperations {
  readonly list: IListTemplateVariables;
  readonly save: ISaveTemplateVariables;
  readonly getPage: IGetPageTemplateVariables;
  readonly savePage: ISavePageTemplateVariables;
}
