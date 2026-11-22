import type { IAddonPackageIdentity } from '../../../domain/addons/addon-installation.js';

export interface IPreparedAddonPackage extends IAddonPackageIdentity {
  readonly contentId: string;
}

/** Stages verified packages without evaluating code; installation is explicit. */
export interface IAddonPackageDelivery {
  prepare(repositoryUrl: string, releaseTag: string | null): Promise<IPreparedAddonPackage>;
  installed(addonKey: string, runtimeDigest: string): boolean;
  install(contentId: string): Promise<void>;
  discard(contentId: string): Promise<void>;
}
