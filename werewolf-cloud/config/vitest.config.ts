import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Root suite: API, domain and workspace scripts. The web app has its own config
// (apps/web/vitest.config.ts) because its tests need jsdom and SvelteKit stubs, so
// nothing under apps/web/src is collected twice.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
    },
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@werewolf/domain': path.resolve(__dirname, '../packages/domain/src'),
    },
  },
});
