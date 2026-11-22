export interface ISiteAddonAccessPort {
  requireAdministrator(siteId: string, actorId: string): Promise<void>;
}

export interface ISiteAddonValuesPort {
  nextId(): string;
  nextVersion(): string;
  now(): Date;
}
