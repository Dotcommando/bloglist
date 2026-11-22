export enum AssetPermission {
  Upload = 'Upload',
  Read = 'Read',
}

export interface IAssetAccessPort {
  requirePermission(siteId: string, actorId: string, permission: AssetPermission): Promise<void>;
  requireProcessing(siteId: string): Promise<void>;
}
