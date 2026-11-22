import type { PublishedResolution } from '../../../domain/publication/published-resolution.js';

export interface IResolvePublishedPathInput {

  readonly siteId: string;
  readonly path: string;
}

export interface IResolvePublishedPath {
  execute(input: IResolvePublishedPathInput): Promise<PublishedResolution>;
}
