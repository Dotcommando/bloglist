export interface IDeploymentAccessPort {
  requireAdministrator(siteId: string, actorId: string): Promise<void>;
}

export interface IDeploymentValuesPort {
  id(): string;
  now(): Date;
}
