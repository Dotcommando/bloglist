export interface IRoutingAccessPort {
  assertCanAssignPageUrl(siteId: string): Promise<void>;
  assertCanChangePageUrl(siteId: string): Promise<void>;
  assertCanReadRouting(siteId: string): Promise<void>;
}
