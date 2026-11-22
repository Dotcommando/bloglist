export interface ISiteAccessPort {
  assertCanListSites(): Promise<void>;
  listAuthorizedSiteIds?(): Promise<readonly string[] | null>;
  assertCanCreateSite(): Promise<void>;
  assertCanReadSite(siteId: string): Promise<void>;
}

export interface ISiteEditingAccessPort {
  assertCanUpdateSite(siteId: string): Promise<void>;
  assertCanArchiveSite(siteId: string): Promise<void>;
}
