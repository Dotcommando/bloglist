import type { IImageDimensions } from '../../../domain/media/asset.js';
import type { ISiteFavicon } from '../../../domain/media/site-favicon.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IStoredSiteFavicon extends ISiteFavicon {
  readonly content: IBinaryContent;
  dispose(): Promise<void>;
}

export interface ISiteFaviconStore {
  /** Open a stable snapshot; the caller must dispose it, even when it does not read the bytes. */
  read(siteId: string): Promise<IStoredSiteFavicon | null>;
  /** Atomically replace the previous icon with a completely validated icon. */
  replace(siteId: string, content: IBinaryContent, dimensions: IImageDimensions): Promise<ISiteFavicon>;
  /** Remove the site's current icon; an already absent icon is a successful retry. */
  remove(siteId: string): Promise<void>;
}
