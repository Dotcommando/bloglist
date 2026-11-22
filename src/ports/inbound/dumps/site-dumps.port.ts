import type {
  ISiteDump, ISiteDumpApplication, ISiteDumpCreation, ISiteDumpReview, SiteDumpType,
} from '../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface ISiteDumpScope { readonly siteId: string; readonly actorId: string; }

export interface ISiteDumpSelection extends ISiteDumpScope { readonly filename: string; }

export interface ICreateSiteDump { execute(input: ISiteDumpScope & { readonly options?: ISiteDumpCreation }):
Promise<ISiteDump>; }

export interface IListSiteDumps { execute(input: ISiteDumpScope): Promise<readonly ISiteDump[]>; }

export interface IGetSiteDump {
  execute(input: ISiteDumpSelection): Promise<ISiteDump & { readonly content: IBinaryContent }>;
}

export interface IImportSiteDump {
  execute(input: ISiteDumpScope & { readonly content: IBinaryContent }): Promise<ISiteDump>;
}

export interface IRestoreSiteDump {
  execute(input: ISiteDumpSelection & { readonly options?: ISiteDumpApplication }): Promise<void>;
}

export interface IDeleteSiteDump { execute(input: ISiteDumpSelection): Promise<void>; }

export interface IGetDumpExportItems {
  execute(input: ISiteDumpScope & { readonly type: SiteDumpType }): Promise<ISiteDumpReview>;
}

export interface IInspectSiteDump { execute(input: ISiteDumpSelection): Promise<ISiteDumpReview>; }
