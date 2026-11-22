export interface IAdminAuthSecretsPort {
  issue(): { readonly token: string; readonly tokenDigest: string };
  digest(token: string): string | null;
  loginKey(email: string): string;
  sourceKey(clientAddress: string | null): string;
}

export interface IAdminAuthValuesPort {
  nextSessionId(): string;
  now(): Date;
  sessionExpiresAt(at: Date): Date;
}
