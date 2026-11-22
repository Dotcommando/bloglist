export interface IDeliveryPermit {
  /** Unknown or still-running delivery must continue to block restoration. */
  release(resolved: boolean): Promise<void>;
}

export interface IDeliveryRestoreGuardPort {
  acquire(siteId: string): Promise<IDeliveryPermit | null>;
}
