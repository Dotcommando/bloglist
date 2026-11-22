import { readFileSync } from 'node:fs';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const pkg: { version: string } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const release: { format: number; version?: string; commit?: string; checksum?: string } = JSON.parse(
    readFileSync(new URL('../cms-release.json', import.meta.url), 'utf8'));

  if (
    release.format !== 0
    && (release.format !== 1
    || release.version !== pkg.version
    || typeof release.commit !== 'string'
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(release.commit)
    || typeof release.checksum !== 'string'
    || !/^[a-f0-9]{64}$/.test(release.checksum))
  ) {
    throw new Error('Invalid CMS release metadata');
  }

  const buildInfo = {
    version: pkg.version,
    commit: release.format === 1 ? release.commit : null,
    checksum: release.format === 1 ? release.checksum : null,
  };
  const env = loadEnv(mode, '..', 'ZARYA_');
  const origin = new URL(env.ZARYA_ADMIN_AUTH_ORIGIN || 'http://localhost:3000');

  return {
    base: '/admin/',
    define: { __CMS_BUILD_INFO__: JSON.stringify(buildInfo) },
    plugins: [svelte()],
    build: { manifest: true },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/admin': {
          target: 'http://127.0.0.1:' + (env.ZARYA_HTTP_PORT || '3000'),
          changeOrigin: true,
          configure(proxy): void {
            proxy.on('proxyReq', (request, incoming) => {
              request.setHeader('host', origin.host);

              if (['http://localhost:5173', 'http://127.0.0.1:5173'].includes(incoming.headers.origin ?? '')) {
                request.setHeader('origin', origin.origin);
              }
            });
          },
        },
      },
    },
  };
});
