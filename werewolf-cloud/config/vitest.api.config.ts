import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
    },
    include: ['apps/api/__tests__/**/*.test.ts'],
    // Minimal plugins to avoid SvelteKit Vite plugin issues
    plugins: [],
  },
});