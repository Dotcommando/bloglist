import type { Url } from '../../../domain/routing/url.js';

export interface IRebindUrlToPageInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly urlId: string;
  readonly expectedVersion: string;
  readonly replacementPageId: string;
}

export interface IRebindUrlToPage {
  execute(input: IRebindUrlToPageInput): Promise<Url>;
}
