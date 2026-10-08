import { defineConfig } from 'vitest/config'
export default defineConfig({
  root: import.meta.dirname,
  test: { name: 'core', include: ['src/**/*.test.ts'], passWithNoTests: true },
})
