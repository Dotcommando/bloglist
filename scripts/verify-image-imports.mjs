import 'reflect-metadata';

import assert from 'node:assert/strict';

const entries = new Map([
  ['runtime', [
    '../dist/infra/public-http.module.js',
    '../dist/infra/resources/process-supervisor.js',
  ]],
  ['cloudflare', [
    '../dist/infra/deployment/manage-deployment.js',
  ]],
]);

const role = process.argv[2];

assert.equal(process.argv.length, 3, 'Specify the runtime or cloudflare image role');

assert(entries.has(role), 'Unknown image role');

assert.equal(process.getuid?.(), 1000, 'Image verification requires UID 1000');

// Import composition definitions; do not bootstrap CMS, connect to MongoDB or deploy.
for (const entry of entries.get(role)) {
  await import(new URL(entry, import.meta.url).href);
}

console.log('Zarya ' + role + ' image imports verified as UID 1000');
