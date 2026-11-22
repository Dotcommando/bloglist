import type { PageStatus } from '../../../domain/pages/page-status.enum.js';
import type { IPublishedRouting } from '../../../domain/publication/published-routing.js';
import type { IVersionedUrl } from '../../../domain/routing/versioned-url.js';

export interface IUrlCatalog {
  readonly siteId: string;
  readonly urls: readonly IVersionedUrl[];
  readonly pages: readonly {
    pageId: string;
    title: string;
    language: string;
    status: PageStatus;
    robotsIndex: boolean;
  }[];
  readonly published: IPublishedRouting | null;
}

export interface IGetUrlCatalog {
  execute(input: { siteId: string }): Promise<IUrlCatalog>;
}
