import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { assertImageVersion, verifyReleaseConsistency } from '../../scripts/release-consistency.mjs';

it('keeps root, admin, lock and Compose images aligned with the stable release', async () => {
  const metadata = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  expect(await verifyReleaseConsistency(process.cwd())).toMatchObject({ version: metadata.version });
});

it('rejects an older tag even when the newer build reports a valid version', () => {
  expect(() => assertImageVersion('site-custom-app:0.13.0', '0.14.0', '0.14.0')).toThrow();
  expect(() => assertImageVersion('site-custom-executor:0.14.0', '0.14.0', '0.13.0')).toThrow();
  expect(() => assertImageVersion('site-custom-app:0.14.0-official', '0.14.0', '0.14.0')).toThrow();
  expect(() => assertImageVersion('site-custom-app:0.14.0', '0.14.0', '0.14.0')).not.toThrow();
});
