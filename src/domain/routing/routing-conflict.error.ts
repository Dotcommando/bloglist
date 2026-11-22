export class RoutingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingConflictError';
  }
}
