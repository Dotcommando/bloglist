import type { IActivePublication } from '../../../domain/publication/publication-release.js';
import type { Url } from '../../../domain/routing/url.js';
import type { IRedirectUrlInput } from './redirect-url.port.js';

export interface IRedirectedPublishedUrl {
  readonly url: Url;
  readonly publication: IActivePublication | null;
  readonly publicationFailed: boolean;
}

export interface IRedirectPublishedUrl {
  execute(input: IRedirectUrlInput): Promise<IRedirectedPublishedUrl>;
}
