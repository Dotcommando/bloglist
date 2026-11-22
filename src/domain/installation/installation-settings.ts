import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

/** Global to one backend installation, independent of site ownership. */
export interface IInstallationSettings {
  readonly adminOrigin: string;
  readonly previousOrigin: string | null;
  readonly version: string;
}

export function adminAddressOrigin(address: string): string {
  try {
    const url = new URL(address);
    const labels = url.hostname.split('.');

    if (
      address.length > 2048
      || url.protocol !== 'https:'
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || !['/admin', '/admin/'].includes(url.pathname)
      || labels.length < 2
      || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      || !/^[a-z][a-z0-9-]*$/.test(labels.at(-1) ?? '')
      || ['localhost', 'local', 'internal', 'test', 'invalid', 'example'].includes(labels.at(-1) ?? '')
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'A public HTTPS /admin address is required');
  }
}
