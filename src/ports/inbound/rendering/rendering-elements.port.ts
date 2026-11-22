import type { IContentAccess, IContentCreationAccess } from '../../../domain/authorization/content-access.js';
import type { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import type {
  IElementContent, IElementIdentity, IElementUsage, IRenderingElementState,
} from '../../../domain/rendering/rendering-element.js';
import type { IPreviewResult } from '../publication/preview-page.port.js';

export interface IElementDetails extends IRenderingElementState {
  readonly usages: readonly IElementUsage[];
}

export interface IListRenderingElements {
  execute(input: { readonly siteId: string; readonly kind: TemplateSourceKind; readonly authority?: IContentAccess }):
  Promise<readonly IRenderingElementState[]>;
}

export interface IGetRenderingElement {
  execute(input: IElementIdentity & { readonly authority?: IContentAccess }): Promise<IElementDetails>;
}

export interface ICreateRenderingElement {
  execute(input: { readonly siteId: string; readonly kind: TemplateSourceKind }
    & IElementContent & IContentCreationAccess):
  Promise<IRenderingElementState>;
}

export interface IUpdateRenderingElement {
  execute(input: IElementIdentity & IElementContent & {
    readonly expectedVersion: string;
    readonly draftOnly?: true;
    readonly authority?: IContentAccess;
  }):
  Promise<IRenderingElementState>;
}

export interface IPreviewRenderingElement {
  execute(input: IElementIdentity & { readonly pageId: string; readonly expectedVersion: string }):
  Promise<IPreviewResult>;
}

export interface IRenderingOperations {
  readonly list: IListRenderingElements;
  readonly get: IGetRenderingElement;
  readonly create: ICreateRenderingElement;
  readonly update: IUpdateRenderingElement;
  readonly preview: IPreviewRenderingElement;
}
