import { packRuntimeAddonPackage } from './infra/addons/pack-addon-package.js';

const [directory, filename, ...extra] = process.argv.slice(2);

if (!directory || !filename || extra.length) {
  throw new Error('Usage: npm run addon:pack -- <runtime-package-directory> <output/addon.runtime.gz>');
}

await packRuntimeAddonPackage(directory, filename);
