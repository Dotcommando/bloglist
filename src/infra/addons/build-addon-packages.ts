import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { buildAddonPackage } from '../../adapters/outbound/runtime/addons/addon-package-builder.js';
import { requireAddonKey } from '../../domain/addons/site-addon.js';
import { installedAddons } from './installed-addons.js';

export async function buildRegisteredAddonPackages(): Promise<void> {
  for (const addon of installedAddons) {
    if (!addon.transfer?.serverSource) {
      continue;
    }

    const root = path.resolve('dist/addon-packages');
    const target = path.resolve(root, addon.definition.addonKey);

    requireAddonKey(addon.definition.addonKey);

    if (path.dirname(target) !== root) {
      throw new Error('Add-on build target must stay inside the package output directory');
    }

    await mkdir(root, { recursive: true });
    const staged = await mkdtemp(path.join(root, '.build-'));

    try {
      await buildAddonPackage(addon, staged);
      await rm(target, { recursive: true, force: true });
      await rename(staged, target);
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
  }
}
