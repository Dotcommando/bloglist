import type { IContentAccess } from '../../../domain/authorization/content-access.js';
import type { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import type {
  IElementIdentity, IElementUsage, IRenderingElementState,
} from '../../../domain/rendering/rendering-element.js';
import type { IPreviewResult } from '../../inbound/publication/preview-page.port.js';

export interface IElementFallback {
  list(siteId: string, excluded: readonly IElementIdentity[]): Promise<readonly IRenderingElementState[]>;
}

export interface IElementCatalog {
  find(identity: IElementIdentity, access?: IContentAccess): Promise<IRenderingElementState | null>;
  list(siteId: string, kind?: TemplateSourceKind, access?: IContentAccess): Promise<readonly IRenderingElementState[]>;
}

export interface IElementBackup {
  write(element: IRenderingElementState): Promise<void>;
}

export interface IElementUsages {
  find(identity: IElementIdentity): Promise<readonly IElementUsage[]>;
}

export interface IElementValues {
  nextId(): string;
  nextVersion(): string;
  now(): Date;
}

export interface IElementPagePreview {
  execute(input: { readonly siteId: string; readonly pageId: string }): Promise<IPreviewResult>;
}
