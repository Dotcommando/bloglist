import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: { deps: { inline: ['@zarya/addon-contracts'] } },
    include: ['test/**/*.spec.ts'],
    exclude: ['test/integration/**'],
    globals: true,
  },
});
