import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: { deps: { inline: ['@zarya/addon-contracts'] } },
    include: ['test/integration/**/*.spec.ts'],
    globals: true,
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
