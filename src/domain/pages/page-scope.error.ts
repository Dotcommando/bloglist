export class PageScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageScopeError';
  }
}
