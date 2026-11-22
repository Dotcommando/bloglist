export class PageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageConflictError';
  }
}
