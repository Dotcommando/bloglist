import type { ModuleRef } from '@nestjs/core';
import type { Connection } from 'mongoose';

import {
  MongooseAddonFileReferences,
} from '../../adapters/outbound/persistence/mongoose/media/addon-file-references.adapter.js';
import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import { ADDON_PACKAGE_REGISTRY } from '../addons/addons.tokens.js';

export function addonFileReferences(connection: Connection, ref: ModuleRef): MongooseAddonFileReferences {
  return new MongooseAddonFileReferences(connection,
    () => ref.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY, { strict: false }).registrations());
}
