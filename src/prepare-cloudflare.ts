import { prepareCloudflare } from './infra/deployment/prepare-cloudflare.js';

try {
  await prepareCloudflare(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cloudflare preparation failed');
  process.exitCode = 1;
}
