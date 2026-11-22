import type { ISiteFavicon } from '../../../domain/media/site-favicon.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IGetSiteFavicon {
  execute(input: { readonly siteId: string }): Promise<ISiteFavicon | null>;
}

export interface IUploadSiteFavicon {
  execute(input: {
    readonly siteId: string;
    readonly filename: string;
    readonly content: IBinaryContent;
  }): Promise<ISiteFavicon>;
}

export interface IDeleteSiteFavicon {
  execute(input: { readonly siteId: string }): Promise<void>;
}

export interface ISiteFaviconOperations {
  readonly delete: IDeleteSiteFavicon;
  readonly get: IGetSiteFavicon;
  readonly upload: IUploadSiteFavicon;
}
