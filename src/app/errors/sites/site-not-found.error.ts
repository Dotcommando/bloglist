export class SiteNotFoundError extends Error {
  constructor(readonly siteId: string) {
    super(`Site ${siteId} was not found`);
    this.name = 'SiteNotFoundError';
  }
}
