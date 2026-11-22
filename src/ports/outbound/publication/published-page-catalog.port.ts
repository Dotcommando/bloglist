export interface IPublishedPageCatalogPort {
  /** Complete nonredirect page identities from a verified immutable Ready release. */
  readPublishedPageIds(siteId: string, releaseId: string): Promise<readonly string[] | null>;
}
