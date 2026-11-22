import type { IActivePublication } from '../../../domain/publication/publication-release.js';
import type { Url } from '../../../domain/routing/url.js';
import type { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import type { UrlRedirectStatus } from '../../../domain/routing/url-redirect-status.enum.js';

export type IMaterializeVirtualUrlCommand = {
  readonly siteId: string;
  readonly path: string;
} & ({ readonly kind: UrlKind.PAGE; readonly pageId: string }
  | { readonly kind: UrlKind.REDIRECT; readonly targetUrlId: string; readonly redirectStatus: UrlRedirectStatus });

export type IMaterializeVirtualUrlInput = IMaterializeVirtualUrlCommand & { readonly actorId: string };

export interface IMaterializedVirtualUrl {
  readonly url: Url;
  readonly publication: IActivePublication | null;
  readonly publicationFailed: boolean;
}

export interface IMaterializeVirtualUrl {
  execute(input: IMaterializeVirtualUrlInput): Promise<IMaterializedVirtualUrl>;
}
