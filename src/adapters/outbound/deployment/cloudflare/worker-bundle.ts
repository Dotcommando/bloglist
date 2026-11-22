import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

export async function bundleCloudflareWorker(entry: URL): Promise<string> {
  const result = await build({
    entryPoints: [fileURLToPath(entry)],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });

  if (result.outputFiles.length !== 1) {
    throw new Error('Cloudflare Worker bundle is unavailable');
  }

  return result.outputFiles[0]!.text;
}
