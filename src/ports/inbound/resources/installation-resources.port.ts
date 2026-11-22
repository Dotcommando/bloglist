import type { IInstallationResourceView } from '../../../domain/resources/installation-resources.js';
import type { ISiteProcessAllocation } from '../../../domain/resources/site-process-allocation.js';

export interface IGetInstallationResources {
  execute(input: { readonly token: string | null }): Promise<IInstallationResourceView>;
}

export interface IChangeInstallationResources {
  execute(input: { readonly token: string | null;
    readonly expectedVersion: string;
    readonly databaseCpu: number;
    readonly sitePoolSize?: number;
    readonly cmsCpu?: number;
    readonly sites: readonly ISiteProcessAllocation[] }): Promise<IInstallationResourceView>;
}
