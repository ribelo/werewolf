import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { sveltePreprocess } from 'svelte-preprocess'

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess()
    })
  ],
  server: {
    port: 1420,
    strictPort: true,
    hmr: {
      port: 1421,
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})