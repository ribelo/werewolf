/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  resolve: {
    alias: {
      '$lib': resolve(__dirname, './src/lib'),
      // SvelteKit injects '$app/*' as virtual modules from its Vite plugin,
      // which is not loaded for unit tests: use the explicit stubs instead.
      '$app/environment': resolve(__dirname, './src/test/stubs/app-environment.ts'),
      '$app/navigation': resolve(__dirname, './src/test/stubs/app-navigation.ts'),
      '$app/paths': resolve(__dirname, './src/test/stubs/app-paths.ts'),
      '$app/stores': resolve(__dirname, './src/test/stubs/app-stores.ts'),
    },
    // Vitest resolves the SSR build of svelte by default, under which onMount
    // never runs and hydration-only code is stripped. Component tests must use
    // the browser build, as they do in the running app.
    conditions: ['browser'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
