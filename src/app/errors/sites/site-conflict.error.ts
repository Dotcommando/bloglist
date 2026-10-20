export class SiteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiteConflictError';
  }
}
