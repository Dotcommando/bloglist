import type { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import type { CmsExtensions, ICmsAddonExtension, ICmsExtensionOperation } from '@zarya/addon-contracts/cms-extensions';
import { CmsExtensionOperationKind } from '@zarya/addon-contracts/cms-extensions';

export { CmsExtensionOperationKind };

export type { CmsExtensions, ICmsAddonExtension, ICmsExtensionOperation };

export interface ICmsExtensionAccessPort {
  authorize(siteId: string, addonKey: string, access: AddonOperationAccess): Promise<void>;
}
