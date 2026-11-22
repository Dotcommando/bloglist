export interface ISiteStorageScope {
  primaryDomain(siteId: string): Promise<string>;
}

export interface ISiteAssetDirectory {
  /** Finish relocation to the site's current registered primary domain; safe to repeat after failure. */
  synchronize(siteId: string): Promise<void>;
}
