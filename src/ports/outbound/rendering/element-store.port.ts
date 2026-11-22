import type { IContentAccess, IContentCreationAccess } from '../../../domain/authorization/content-access.js';
import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import type { IElementIdentity, IRenderingElementState } from '../../../domain/rendering/rendering-element.js';

export interface IElementStore {
  find(identity: IElementIdentity, access?: IContentAccess): Promise<IRenderingElementState | null>;
  list(siteId: string, kind?: TemplateSourceKind, access?: IContentAccess):
  Promise<readonly IRenderingElementState[]>;
  save(element: IRenderingElementState, expectedVersion: string | null, hookChange?: IHookCommitIntent,
    access?: IContentCreationAccess): Promise<void>;
  synchronizeBackup(identity: IElementIdentity, version: string,
    write: (element: IRenderingElementState) => Promise<void>, access?: IContentAccess):
  Promise<IRenderingElementState>;
}
