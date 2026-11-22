import { availableParallelism } from 'node:os';

import { defineConfig } from 'vitest/config';

/** Explicit local minor-release gate; independent files own their databases/roots. */
export default defineConfig({
  test: {
    server: { deps: { inline: ['@zarya/addon-contracts'] } },
    include: [
      'test/integration/admin-site-journey.integration.spec.ts',
      'test/integration/admin-users-http.integration.spec.ts',
      'test/integration/rbac-migration.integration.spec.ts',
      'test/integration/addon-live-updates.integration.spec.ts',
      'test/integration/addon-action-updates.integration.spec.ts',
      'test/integration/admin-content-recovery-journey.integration.spec.ts',
      'test/integration/admin-file-url-recovery-journey.integration.spec.ts',
      'test/integration/admin-page-details-journey.integration.spec.ts',
      'test/integration/admin-elements-runtime-journey.integration.spec.ts',
      'test/integration/template-variables.integration.spec.ts',
      'test/integration/request-cache.integration.spec.ts',
      'test/integration/admin-files-journey.integration.spec.ts',
      'test/integration/admin-media-mutations-journey.integration.spec.ts',
      'test/integration/admin-metadata-journey.integration.spec.ts',
      'test/integration/admin-tv-journey.integration.spec.ts',
      'test/integration/admin-tv-interactions-journey.integration.spec.ts',
      'test/integration/admin-urls-journey.integration.spec.ts',
      'test/integration/admin-routing-rejections-journey.integration.spec.ts',
      'test/integration/admin-publication.integration.spec.ts',
      'test/integration/admin-rendering-ui.integration.spec.ts',
      'test/integration/admin-page-tree.integration.spec.ts',
      'test/integration/admin-hierarchy-scroll.integration.spec.ts',
      'test/integration/admin-document-mime.integration.spec.ts',
      'test/integration/admin-urls.integration.spec.ts',
      'test/integration/rendering-elements.integration.spec.ts',
      'test/integration/snippets.integration.spec.ts',
      'test/integration/template-variables-ui.integration.spec.ts',
      'test/integration/template-image-library-ui.integration.spec.ts',
      'test/integration/missing-media-tv-ui.integration.spec.ts',
      'test/integration/file-library.integration.spec.ts',
      'test/integration/files-layout.integration.spec.ts',
      'test/integration/sitemap-presentation.integration.spec.ts',
    ],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: true,
    // Parallel browser journeys also run MongoDB fixtures and CMS child processes.
    maxWorkers: Math.min(4, availableParallelism()),
    retry: 0,
    reporters: ['default', 'json'],
    outputFile: { json: '.tmp/admin-release-results/report.json' },
  },
});
