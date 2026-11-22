import type { IUrlState } from './url.js';

export interface IVersionedUrl {
  readonly url: IUrlState;
  readonly version: string;
}
