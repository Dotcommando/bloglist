import type { ISiteDump, ISiteDumpCreation } from '../../../domain/dumps/site-dump.js';

export interface ICaptureSiteDump {
  execute(input: { readonly siteId: string;
    readonly options?: ISiteDumpCreation;
    readonly signal?: AbortSignal }): Promise<ISiteDump>;
}
