export interface IPageAccessPort {
  assertCanCreatePage(siteId: string): Promise<void>;
  assertCanReadPage(siteId: string): Promise<void>;
  assertCanUpdatePage(siteId: string): Promise<void>;
}
