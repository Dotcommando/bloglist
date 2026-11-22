export interface IAddonAvailabilityPort {
  requireAvailable(addonKey: string): Promise<void>;
}
