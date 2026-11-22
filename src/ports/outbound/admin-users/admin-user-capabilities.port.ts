export interface IAdminUserAccessPort {
  requireAdministrator(actorId: string): Promise<void>;
}

export interface IAdminPasswordPort {
  hash(password: string): Promise<string>;
  verify(password: string, digest: string | null): Promise<boolean>;
}

export interface IAdminUserValuesPort {
  nextId(): string;
  nextVersion(): string;
  now(): Date;
}
