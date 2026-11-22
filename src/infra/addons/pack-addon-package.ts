import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  maximumAddonArchiveBytes, packAddonArchive,
} from '../../adapters/outbound/runtime/addons/addon-package-archive.js';
import { readAddonPackageManifest } from '../../adapters/outbound/runtime/addons/addon-package-manifest.js';

export async function packRuntimeAddonPackage(directory: string, filename: string): Promise<void> {
  const manifest = readAddonPackageManifest(JSON.parse(await readFile(path.join(directory,
    'addon.runtime.json'), 'utf8')));

  if (!manifest.cmsVersion) {
    throw new Error('The release must declare a minimum cmsVersion');
  }

  const parent = path.dirname(path.resolve(filename));

  await mkdir(parent, { recursive: true });
  const staged = await mkdtemp(path.join(parent, '.pack-'));

  if (path.dirname(staged) !== parent) {
    throw new Error('Release staging escaped the output directory');
  }

  try {
    const archive = path.join(staged, 'addon.runtime.gz');

    await packAddonArchive(directory, archive);

    if ((await stat(archive)).size > maximumAddonArchiveBytes) {
      throw new Error('The release archive exceeds its compressed size limit');
    }
    await copyFile(archive, filename, constants.COPYFILE_EXCL);
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}
