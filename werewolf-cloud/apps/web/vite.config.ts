import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		noExternal: ['svelte-i18n'],
		external: ['intl-messageformat', 'intl-messageformat-parser', 'intl-format-cache']
	},
	optimizeDeps: {
		include: ['svelte-i18n'],
		exclude: ['intl-messageformat', 'intl-messageformat-parser', 'intl-format-cache']
	},
	build: {
		rollupOptions: {
			output: {
				interop: 'auto'
			}
		}
	}
});