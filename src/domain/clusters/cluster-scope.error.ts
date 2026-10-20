export class ClusterScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClusterScopeError';
  }
}
