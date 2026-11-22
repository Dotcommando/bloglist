import type { Site } from '../../../domain/sites/site.js';

export interface IResolveSiteInput {
  readonly hostname: string;
  readonly authority?: string;
}

export interface IResolveSite {
  execute(input: IResolveSiteInput): Promise<Site | null>;
}
