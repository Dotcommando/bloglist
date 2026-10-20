export class ClusterConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClusterConflictError';
  }
}
