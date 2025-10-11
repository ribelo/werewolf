import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
    },
    include: [
      'packages/**/*.test.ts',
      'apps/api/**/*.test.ts',
      'apps/web/src/lib/__tests__/**/*.test.ts',
    ],
  },
});
