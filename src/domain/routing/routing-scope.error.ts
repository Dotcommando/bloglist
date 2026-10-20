export class RoutingScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingScopeError';
  }
}
