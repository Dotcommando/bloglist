import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);

export const mongoImage = 'mongo:9.0.8@sha256:1444adda2e4b8d6a0d7f242a625d834a78d6e3aa6e4ed1b0b4c2dab2318c5e3d';

export function assertImageVersion(image, expected, built) {
  assert.match(expected, /^[0-9]+\.[0-9]+\.[0-9]+$/);
  assert.equal(image.slice(image.lastIndexOf(':') + 1), expected, 'Image tag differs from the release');
  assert.equal(built, expected, 'Built package version differs from the image tag');
}

export async function verifyReleaseConsistency(root) {
  const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  const admin = await json('admin/package.json');

  assert.match(pkg.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);

  for (const version of [lock.version, lock.packages[''].version, admin.version, lock.packages.admin.version]) {
    assert.equal(version, pkg.version, 'Release metadata versions differ');
  }

  for (const file of ['compose.yml', 'compose.production.yml']) {
    const source = await readFile(path.join(root, file), 'utf8');

    // Check the controlled source references as well as resolved Compose during preparation.
    assert(source.includes('image: ' + mongoImage), 'MongoDB image differs from the verified release image');
    assert(source.includes('${ZARYA_CMS_VERSION:?Run node scripts/prepare-compose.mjs}'),
      'Application images must derive their tags from prepared release metadata');
    assert(!/cms-zarya-(?:app|cloudflare):[0-9]/.test(source), 'Hardcoded CMS image tag');
  }

  return { version: pkg.version, mongoImage };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' }, image: { type: 'string', multiple: true } } });
    const root = path.resolve(values.root ?? '.');
    const metadata = await verifyReleaseConsistency(root);

    for (const image of values.image ?? []) {
      const { stdout } = await run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image,
        '--input-type=module', '-e',
        "import {readFileSync} from 'node:fs';"
          + "process.stdout.write(JSON.parse(readFileSync('/app/package.json','utf8')).version)"],
      { maxBuffer: 65536, timeout: 30000 });

      assertImageVersion(image, metadata.version, stdout.trim());
    }
    console.info('Release versions and image identities are consistent: ' + metadata.version);
  } catch {
    console.error('Release consistency verification failed. '
      + 'Check metadata, Compose references and built image versions.');
    process.exitCode = 1;
  }
}
