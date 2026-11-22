export class LocalSiteListenerError extends Error {
  constructor(readonly origin: string, cause: unknown) {
    super('Could not open the local site listener', { cause });
    this.name = 'LocalSiteListenerError';
  }
}
