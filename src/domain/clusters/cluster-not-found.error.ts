export class ClusterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClusterNotFoundError';
  }
}
