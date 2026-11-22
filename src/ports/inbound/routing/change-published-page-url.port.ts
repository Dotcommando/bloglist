import type { IActivePublication } from '../../../domain/publication/publication-release.js';
import type { Url } from '../../../domain/routing/url.js';
import type { IChangePageUrlInput } from './change-page-url.port.js';

export interface IChangedPublishedPageUrl {
  readonly url: Url;
  readonly publication: IActivePublication | null;
  readonly publicationFailed: boolean;
}

export interface IChangePublishedPageUrl {
  execute(input: IChangePageUrlInput & { actorId: string }): Promise<IChangedPublishedPageUrl>;
}
