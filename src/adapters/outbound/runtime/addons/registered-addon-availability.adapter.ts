import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IAddonAvailabilityPort } from '../../../../ports/outbound/addons/addon-availability.port.js';

export class RegisteredAddonAvailabilityAdapter implements IAddonAvailabilityPort {
  constructor(private readonly availableKeys: readonly string[] | (() => readonly string[]),
    private readonly verify: (addonKey: string) => Promise<void>) {}

  async requireAvailable(addonKey: string): Promise<void> {
    const keys = typeof this.availableKeys === 'function' ? this.availableKeys() : this.availableKeys;

    if (!keys.includes(addonKey)) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Add-on runtime is not configured');
    }

    try {
      await this.verify(addonKey);
    } catch (cause) {
      const unavailable = new BusinessError(BusinessErrorCode.AddonUnavailable,
        'Add-on runtime prerequisites are unavailable');

      Object.defineProperty(unavailable, 'cause', { value: cause });
      throw unavailable;
    }
  }
}
