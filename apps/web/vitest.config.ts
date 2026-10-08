import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  test: {
    name: 'screens',
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    passWithNoTests: true,
  },
})
