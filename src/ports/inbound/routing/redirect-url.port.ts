import type { Url } from '../../../domain/routing/url.js';
import type { UrlRedirectStatus } from '../../../domain/routing/url-redirect-status.enum.js';

export interface IRedirectUrlInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly urlId: string;
  readonly expectedVersion: string;
  readonly targetUrlId: string;
  readonly redirectStatus: UrlRedirectStatus;
}

export interface IRedirectUrl {
  execute(input: IRedirectUrlInput): Promise<Url>;
}
