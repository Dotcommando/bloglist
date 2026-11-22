import type { AddonOperationAccess, AddonValue, IAddonObject } from './addons.js';
import type { ICmsApi } from './cms.js';

export interface ICmsAddonApiHost {
  forSite(siteId: string, access?: AddonOperationAccess): Promise<ICmsApi>;
}

export enum CmsExtensionOperationKind { Query = 'Query', Command = 'Command' }

export interface ICmsExtensionContext {
  readonly siteId: string;
  readonly actorId: string;
  readonly cms: ICmsApi;
}

export interface ICmsExtensionOperation {
  readonly kind: CmsExtensionOperationKind;
  readonly access: AddonOperationAccess;
  execute(input: IAddonObject, context: ICmsExtensionContext): Promise<AddonValue>;
}

export interface ICmsAddonExtension {
  readonly version: 1;
  readonly objects: Readonly<Record<string, Readonly<Record<string, ICmsExtensionOperation>>>>;
}

export type CmsExtensions = Readonly<Record<string, Readonly<Record<string,
  Readonly<Record<string, (input?: IAddonObject) => Promise<AddonValue>>>>>>>;
