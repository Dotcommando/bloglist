import type { Url } from '../../../domain/routing/url.js';

export interface IFindUrlByPathInput {
  siteId: string;
  path: string;
}

export interface IFindUrlByPath {
  execute(input: IFindUrlByPathInput): Promise<Url | null>;
}
